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

  // Figure out owner_id (auth uid) for RLS on session/events tables
  let owner_id: string | null = null
  try {
    // For SSR server client, use getUser via auth endpoint; if not available, leave null
    const { data, error } = await (supabase as any).auth.getUser?.()
    owner_id = data?.user?.id || null
  } catch {
    // ignore; RLS will block inserts if auth context missing
  }

  // Active campaigns
  const { data: campaigns, error: campErr } = await supabase
    .from("campaigns")
    .select("id")
    .eq("status", "active")

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 })

  // Begin a dispatch session record
  const sessionStart = Date.now()
  const config = { CONTACTS_PER_SESSION, SESSION_MS, GAP_MS }
  let sessionId: string | null = null
  if (owner_id) {
    const { data: sessIns } = await supabase
      .from("dispatch_sessions")
      .insert([{ owner_id, channel: "call", config }])
      .select("id")
      .single()
    sessionId = (sessIns as any)?.id || null
  }

  // Reconciliation: sent -> done if call_history present
  const diagnostics: Array<{ campaign_id: string, reconciled: number }> = []
  for (const campaign of campaigns || []) {
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

        // event log
        if (sessionId && owner_id) {
          await supabase.from("dispatch_events").insert([{
            session_id: sessionId,
            owner_id,
            campaign_id: campaign.id,
            contact_id: row.contact_id,
            channel: "call",
            action: "done",
            detail: { reason: "Reconciled from call_history" }
          }])
        }
      }
    }
    diagnostics.push({ campaign_id: campaign.id, reconciled: reconciledCount })
  }

  let dispatched = 0
  const perCampaignStats: Record<string, { sent: number, failed: number, invalid: number, queued_remaining: number }> = {}

  const sessionEndDeadline = sessionStart + SESSION_MS

  // Loop within session window and global limit
  while (Date.now() < sessionEndDeadline && dispatched < CONTACTS_PER_SESSION) {
    let progressed = false

    for (const campaign of campaigns || []) {
      if (Date.now() >= sessionEndDeadline || dispatched >= CONTACTS_PER_SESSION) break
      if (!perCampaignStats[campaign.id]) perCampaignStats[campaign.id] = { sent: 0, failed: 0, invalid: 0, queued_remaining: 0 }

      // Pull one queued contact
      const { data: pendRows } = await supabase
        .from("campaign_contacts")
        .select("id, contact_id")
        .eq("campaign_id", campaign.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)

      if (!pendRows || pendRows.length === 0) {
        const { count } = await supabase
          .from("campaign_contacts")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("status", "pending")
        perCampaignStats[campaign.id].queued_remaining = count || 0
        continue
      }

      const row = pendRows[0]

      // Load contact
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, name, email, phone, opted_out, notes")
        .eq("id", row.contact_id)
        .limit(1)
        .single()

      const phoneRaw = contact?.phone ?? null
      const phoneNorm = normalizePhone(phoneRaw)
      const phoneOk = !!phoneNorm && isValidPhone(phoneNorm)
      const optedOut = !!contact?.opted_out

      // Record selection event
      if (sessionId && owner_id) {
        await supabase.from("dispatch_events").insert([{
          session_id: sessionId,
          owner_id,
          campaign_id: campaign.id,
          contact_id: row.contact_id,
          channel: "call",
          action: "selected",
          detail: { to: phoneNorm || null }
        }])
      }

      // Invalid reasons
      if (!phoneOk || optedOut) {
        const reason = optedOut ? "Opted out" : "Invalid phone"
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

        if (sessionId && owner_id) {
          await supabase.from("dispatch_events").insert([{
            session_id: sessionId,
            owner_id,
            campaign_id: campaign.id,
            contact_id: row.contact_id,
            channel: "call",
            action: "invalid",
            detail: { to: phoneNorm || null, reason }
          }])
        }
        progressed = true
        continue
      }

      // No external webhook; mark as "sent" in-DB and log event
      await supabase
        .from("campaign_contacts")
        .update({ status: "sent", attempts: 1, sent_at: new Date().toISOString() })
        .eq("id", row.id)

      perCampaignStats[campaign.id].sent += 1
      dispatched += 1
      progressed = true

      if (sessionId && owner_id) {
        await supabase.from("dispatch_events").insert([{
          session_id: sessionId,
          owner_id,
          campaign_id: campaign.id,
          contact_id: row.contact_id,
          channel: "call",
          action: "sent",
          detail: {
            to: phoneNorm,
            name: contact?.name || null,
            reason: contact?.notes || null
          }
        }])
      }

      await sleep(GAP_MS)
    }

    if (!progressed) break
  }

  // Compute remaining queued
  for (const campaign of campaigns || []) {
    const { count } = await supabase
      .from("campaign_contacts")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("status", "pending")
    if (!perCampaignStats[campaign.id]) perCampaignStats[campaign.id] = { sent: 0, failed: 0, invalid: 0, queued_remaining: 0 }
    perCampaignStats[campaign.id].queued_remaining = count || 0
  }

  // Close session with totals
  const sessionTotals = {
    dispatched,
    duration_ms: Date.now() - sessionStart,
    // Aggregate quick sums
    sent: Object.values(perCampaignStats).reduce((s, v) => s + v.sent, 0),
    failed: Object.values(perCampaignStats).reduce((s, v) => s + v.failed, 0),
    invalid: Object.values(perCampaignStats).reduce((s, v) => s + v.invalid, 0),
  }
  if (sessionId && owner_id) {
    await supabase
      .from("dispatch_sessions")
      .update({ ended_at: new Date().toISOString(), totals: sessionTotals })
      .eq("id", sessionId)
      .eq("owner_id", owner_id)
  }

  return NextResponse.json({
    success: true,
    session: {
      id: sessionId,
      started_at: new Date(sessionStart).toISOString(),
      ended_at: new Date(Date.now()).toISOString(),
      dispatched,
      max: CONTACTS_PER_SESSION,
      duration_ms: sessionTotals.duration_ms,
    },
    diagnostics: {
      campaigns: diagnostics,
      per_campaign: perCampaignStats,
      limits: { CONTACTS_PER_SESSION, SESSION_MS, GAP_MS }
    }
  })
}
