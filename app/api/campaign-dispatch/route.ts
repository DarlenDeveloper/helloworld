import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Session configuration per requirements
const SESSION_MS = 6 * 60 * 1000 // 6 minutes
const CONTACTS_PER_SESSION = 10   // send 10 contacts per session across all campaigns
const GAP_MS = 3000               // 3 seconds between each send to give webhook breathing room

// Hardcoded Make webhook as requested
const HARDCODED_WEBHOOK = "https://hook.eu2.make.com/86phsw3jl3lny02nr1od8tb3gp86m5xw"

function isValidPhone(phone: unknown): boolean {
  // Per request: accept any non-empty string; no format enforcement
  const p = typeof phone === "string" ? phone.trim() : ""
  return p.length > 0
}

export async function POST() {
  const supabase = await createClient()

  // Fetch active campaigns with webhook_url (kept for future use, but we will always use HARDCODED_WEBHOOK)
  const { data: campaigns, error: campErr } = await supabase
    .from("campaigns")
    .select("id, webhook_url")
    .eq("status", "active")

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 })

  // Seed queues idempotently and reconcile "sent" -> "done" based on call_history
  const diagnostics: Array<{ campaign_id: string, seeded: number | null, reconciled: number, webhook_used: string | null }> = []
  for (const campaign of campaigns || []) {
    let seeded: number | null = null
    try {
      const { data: seededCount, error: seedErr } = await supabase.rpc("populate_campaign_contacts", { p_campaign: campaign.id })
      if (seedErr) {
        console.error("[dispatch] populate_campaign_contacts failed for", campaign.id, seedErr.message)
      } else {
        seeded = Number(seededCount ?? 0)
      }
    } catch (e: any) {
      console.error("[dispatch] populate_campaign_contacts exception for", campaign.id, String(e))
    }

    // Mark previously sent contacts as done if a call exists
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
    const webhook_used = HARDCODED_WEBHOOK
    diagnostics.push({ campaign_id: campaign.id, seeded, reconciled: reconciledCount, webhook_used })
  }

  const sessionStart = Date.now()
  const sessionEnd = sessionStart + SESSION_MS
  let dispatched = 0
  const perCampaignStats: Record<string, { sent: number, failed: number, invalid: number }> = {}

  // Loop within a 6-minute "session" and send up to 10 contacts total across all active campaigns
  while (Date.now() < sessionEnd && dispatched < CONTACTS_PER_SESSION) {
    let progressed = false

    for (const campaign of campaigns || []) {
      if (!perCampaignStats[campaign.id]) perCampaignStats[campaign.id] = { sent: 0, failed: 0, invalid: 0 }
      if (Date.now() >= sessionEnd || dispatched >= CONTACTS_PER_SESSION) break

      // Always use the hardcoded webhook
      const campaignWebhook = HARDCODED_WEBHOOK

      // Pick next single pending contact for this campaign
      const { data: pendRows } = await supabase
        .from("campaign_contacts")
        .select("id, contact_id")
        .eq("campaign_id", campaign.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)

      if (!pendRows || pendRows.length === 0) {
        continue
      }

      const row = pendRows[0]
      // Load the contact details
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, name, email, phone, notes")
        .eq("id", row.contact_id)
        .limit(1)
        .single()

      const phone = contact?.phone?.trim()
      // No strict validation rules; proceed with provided number

      // Build single-contact payload per requirements
      const payload = {
        channel: "call",
        campaign_id: campaign.id,
        contact_id: row.contact_id,
        to: phone,
        name: contact?.name || null,
        reason: contact?.notes || null, // optional "reason" derived from contact snapshot notes
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
          // Wait 3 seconds between sends to give the webhook breathing room
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
        progressed = true
      }
    }

    // If we didn't find anything to process this pass, break to avoid tight loop
    if (!progressed) break
  }

  // If the 10 contacts were dispatched quickly, keep the session open until 6 minutes elapse
  const now = Date.now()
  if (now < sessionEnd) {
    await sleep(sessionEnd - now)
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
    }
  })
}
