import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isValidPhone, normalizePhone } from "@/lib/phone"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Session configuration
const SESSION_MS = 6 * 60 * 1000 // 6 minutes
const CONTACTS_PER_SESSION = 10   // total across all campaigns
const GAP_MS = 3000               // 3 seconds between sends

export async function POST() {
  const supabase = await createClient()

  // Active campaigns
  const { data: campaigns, error: campErr } = await supabase
    .from("campaigns")
    .select("id, webhook_url")
    .eq("status", "active")

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 })

  // Diagnostics
  const diagnostics: Array<{ campaign_id: string, seeded: number | null, reconciled: number, webhook_used: string | null }> = []

  // Reconciliation: mark sent -> done if call_history present
  for (const campaign of campaigns || []) {
    let seeded: number | null = null
    // Do NOT call RPC to avoid "no destination for result" errors
    // Seeding is handled by /api/campaigns/[id]/start which performs idempotent inserts.

    // Reconcile
    const { data: sentRows } = await supabase
      .from("campaign_contacts")
      .select("id, contact_id")
      .eq("campaign_id", campaign.id)
      .eq("status", "sent")
      .limit(2000)

    let reconciledCount = 0
    for (const row of sentRows || []) {
      const { data: ch } = await supabase
        .from("call_history")
        .select("id")
        .eq("campaign_id", campaign.id)
        .eq("contact_id", row.contact_id)
        .limit(1)
        .single()
      if (ch) {
        await supabase
          .from("campaign_contacts")
          .update({ status: "done", processed_at: new Date().toISOString() })
          .eq("id", row.id)
        reconciledCount += 1
      }
    }
    const webhook_used = null
    diagnostics.push({ campaign_id: campaign.id, seeded, reconciled: reconciledCount, webhook_used })
  }

  const sessionStart = Date.now()
  const sessionEnd = sessionStart + SESSION_MS
  let dispatched = 0
  const perCampaignStats: Record<string, { sent: number, failed: number, invalid: number, queued_remaining: number }> = {}

  // Loop within session window and global limit
  while (Date.now() < sessionEnd && dispatched < CONTACTS_PER_SESSION) {
    let progressed = false

    for (const campaign of campaigns || []) {
      if (Date.now() >= sessionEnd || dispatched >= CONTACTS_PER_SESSION) break
      if (!perCampaignStats[campaign.id]) perCampaignStats[campaign.id] = { sent: 0, failed: 0, invalid: 0, queued_remaining: 0 }

      // Resolve webhook: campaign-specific or fallback env
      const fallbackWebhook = process.env.CAMPAIGN_WEBHOOK_URL || process.env.DISPATCH_WEBHOOK_URL
      const campaignWebhook = (campaign.webhook_url && campaign.webhook_url.trim().length > 0) ? campaign.webhook_url.trim() : (fallbackWebhook || null)

      // Pull one queued contact atomically-ish: pick oldest pending
      const { data: pendRows } = await supabase
        .from("campaign_contacts")
        .select("id, contact_id")
        .eq("campaign_id", campaign.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)

      if (!pendRows || pendRows.length === 0) {
        // Update queued remaining metric
        const { count } = await supabase
          .from("campaign_contacts")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("status", "pending")
        perCampaignStats[campaign.id].queued_remaining = count || 0
        continue
      }

      const row = pendRows[0]

      // Load contact minimal fields
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, name, email, phone, opted_out, notes")
        .eq("id", row.contact_id)
        .limit(1)
        .single()

      // Validate phone using unified utils
      const phoneRaw = contact?.phone ?? null
      const phoneNorm = normalizePhone(phoneRaw)
      const phoneOk = !!phoneNorm && isValidPhone(phoneNorm)
      const optedOut = !!contact?.opted_out

      if (!phoneOk || optedOut || !campaignWebhook) {
        const reason = !campaignWebhook ? "No webhook configured" : optedOut ? "Opted out" : "Invalid phone"
        await supabase
          .from("campaign_contacts")
          .update({
            status: "failed",
            attempts: 1,
            last_error: reason,
            processed_at: new Date().toISOString(),
          })
          .eq("id", row.id)
        perCampaignStats[campaign.id].invalid += 1
        progressed = true
        continue
      }

      // Build payload
      const payload = {
        channel: "call",
        campaign_id: campaign.id,
        contact_id: row.contact_id,
        to: phoneNorm,
        name: contact?.name || null,
        reason: contact?.notes || null,
        contact,
      }

      try {
        const resp = await fetch(campaignWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (!resp.ok) {
          const text = await resp.text().catch(() => "")
          await supabase
            .from("campaign_contacts")
            .update({
              status: "failed",
              attempts: 1,
              last_error: `HTTP ${resp.status}: ${text}`.slice(0, 1000),
              processed_at: new Date().toISOString(),
            })
            .eq("id", row.id)
          perCampaignStats[campaign.id].failed += 1
        } else {
          await supabase
            .from("campaign_contacts")
            .update({ status: "sent", attempts: 1, sent_at: new Date().toISOString() })
            .eq("id", row.id)
          perCampaignStats[campaign.id].sent += 1
          dispatched += 1
          await sleep(GAP_MS)
        }
        progressed = true
      } catch (e: any) {
        await supabase
          .from("campaign_contacts")
          .update({
            status: "failed",
            attempts: 1,
            last_error: String(e).slice(0, 1000),
            processed_at: new Date().toISOString(),
          })
          .eq("id", row.id)
        perCampaignStats[campaign.id].failed += 1
        progressed = true
      }
    }

    if (!progressed) break
  }

  const now = Date.now()
  if (now < sessionEnd) {
    await sleep(sessionEnd - now)
  }

  // Compute final queued remaining for each campaign
  for (const campaign of campaigns || []) {
    const { count } = await supabase
      .from("campaign_contacts")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("status", "pending")
    if (!perCampaignStats[campaign.id]) perCampaignStats[campaign.id] = { sent: 0, failed: 0, invalid: 0, queued_remaining: 0 }
    perCampaignStats[campaign.id].queued_remaining = count || 0
  }

  return NextResponse.json({
    success: true,
    session: {
      started_at: new Date(sessionStart).toISOString(),
      ended_at: new Date(Date.now()).toISOString(),
      dispatched,
      max: CONTACTS_PER_SESSION,
      duration_ms: Date.now() - sessionStart,
    },
    diagnostics: {
      campaigns: diagnostics,
      per_campaign: perCampaignStats,
      limits: { CONTACTS_PER_SESSION, SESSION_MS, GAP_MS }
    }
  })
}
