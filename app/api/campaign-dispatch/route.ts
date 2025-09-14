import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// We intentionally do NOT import phone validators now. We accept any phone string as-is.
// Strict validation and "wrong contact" flagging are removed per requirements.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Session configuration preserved
const SESSION_MS = 6 * 60 * 1000 // 6 minutes
const CONTACTS_PER_SESSION = 10   // total across all campaigns
const GAP_MS = 3000               // 3 seconds pacing

type AttemptStatus = "queued" | "recorded" | "error"

export async function POST() {
  const supabase = await createClient()

  // Resolve owner_id for RLS
  let owner_id: string | null = null
  try {
    const { data } = await (supabase as any).auth.getUser?.()
    owner_id = data?.user?.id || null
  } catch {
    // leave null; inserts will fail under RLS if unauthenticated
  }

  // Create a new session row (fail fast if we cannot create session)
  const sessionStart = Date.now()
  const config = { CONTACTS_PER_SESSION, SESSION_MS, GAP_MS }
  let sessionId: string | null = null
  if (!owner_id) {
    return NextResponse.json({ success: false, error: "No authenticated user (owner_id) found for RLS; cannot create session." }, { status: 401 })
  }
  {
    const { data: sessIns, error: sessErr } = await supabase
      .from("dispatch_sessions")
      .insert([{ owner_id, channel: "call", config }])
      .select("id")
      .single()
    if (sessErr) {
      return NextResponse.json({ success: false, error: `Failed to create dispatch session: ${sessErr.message}` }, { status: 500 })
    }
    sessionId = (sessIns as any)?.id || null
  }

  // Load active campaigns
  const { data: campaigns, error: campErr } = await supabase
    .from("campaigns")
    .select("id")
    .eq("status", "active")

  if (campErr) return NextResponse.json({ success: false, error: campErr.message }, { status: 500 })

  const sessionEndDeadline = sessionStart + SESSION_MS

  // Stats
  let attempted = 0
  let recorded = 0
  let errored = 0
  const perCampaignStats: Record<string, { attempted: number, recorded: number, errored: number, queued_remaining: number }> = {}

  // In-memory de-dupe within a run (campaign_id+contact_id)
  const seen = new Set<string>()
  const keyFor = (campaignId: string, contactId: string) => `${campaignId}:${contactId}`

  // Reconciliation remains (sent -> done) but without emitting external events
  // We still keep state transitions intact and do not block dispatch.
  for (const campaign of campaigns || []) {
    const { data: sentRows } = await supabase
      .from("campaign_contacts")
      .select("id, contact_id")
      .eq("campaign_id", campaign.id)
      .eq("status", "sent")
      .limit(2000)

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
      }
    }
  }

  // Dispatch loop: select pending and "record" attempt rows to dispatch_events (table-based persistence)
  while (Date.now() < sessionEndDeadline && attempted < CONTACTS_PER_SESSION) {
    let progressed = false

    for (const campaign of campaigns || []) {
      if (Date.now() >= sessionEndDeadline || attempted >= CONTACTS_PER_SESSION) break
      if (!perCampaignStats[campaign.id]) perCampaignStats[campaign.id] = { attempted: 0, recorded: 0, errored: 0, queued_remaining: 0 }

      // Oldest pending
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
      const dkey = keyFor(campaign.id, row.contact_id)
      if (seen.has(dkey)) {
        // skip duplicate within same session
        continue
      }
      seen.add(dkey)

      // Load the raw contact (do NOT validate phone/email; accept as-is)
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, name, email, phone, notes")
        .eq("id", row.contact_id)
        .limit(1)
        .single()

      const target = (contact?.phone || contact?.email || "").toString().trim() // any string accepted
      const payload = {
        channel: "call",
        campaign_id: campaign.id,
        contact_id: row.contact_id,
        target,         // raw phone/email accepted as-is
        name: contact?.name || null,
        notes: contact?.notes || null,
        contact,
      }

      attempted += 1
      perCampaignStats[campaign.id].attempted += 1

      // Insert attempt row; never block on "format"; errors recorded as status="error"
      try {
        const { error: attErr } = await supabase
          .from("dispatch_events")
          .insert([{
            session_id: sessionId,
            owner_id,
            campaign_id: campaign.id,
            contact_id: row.contact_id,
            channel: "call",
            action: "sent", // we are recording the dispatch attempt; use "sent" to denote recorded attempt
            detail: payload,
          }])

        if (attErr) {
          errored += 1
          perCampaignStats[campaign.id].errored += 1
          // attempt row failed to insert; write an error record best-effort
          await supabase.from("dispatch_events").insert([{
            session_id: sessionId,
            owner_id,
            campaign_id: campaign.id,
            contact_id: row.contact_id,
            channel: "call",
            action: "failed",
            detail: { error: attErr.message, payload },
          }])
        } else {
          recorded += 1
          perCampaignStats[campaign.id].recorded += 1

          // Mark as "sent" in queue to keep flow identical to previous logic
          await supabase
            .from("campaign_contacts")
            .update({ status: "sent", attempts: 1, sent_at: new Date().toISOString() })
            .eq("id", row.id)
        }

        progressed = true
        await sleep(GAP_MS)
      } catch (e: any) {
        errored += 1
        perCampaignStats[campaign.id].errored += 1
        await supabase.from("dispatch_events").insert([{
          session_id: sessionId,
          owner_id,
          campaign_id: campaign.id,
          contact_id: row.contact_id,
          channel: "call",
          action: "failed",
          detail: { error: String(e), payload },
        }])
        progressed = true
      }
    }

    if (!progressed) break
  }

  // Compute final queued remaining
  for (const campaign of campaigns || []) {
    const { count } = await supabase
      .from("campaign_contacts")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("status", "pending")
    if (!perCampaignStats[campaign.id]) perCampaignStats[campaign.id] = { attempted: 0, recorded: 0, errored: 0, queued_remaining: 0 }
    perCampaignStats[campaign.id].queued_remaining = count || 0
  }

  // Close session
  const totals = {
    attempted,
    recorded,
    errored,
    duration_ms: Date.now() - sessionStart,
  }
  await supabase
    .from("dispatch_sessions")
    .update({ ended_at: new Date().toISOString(), totals })
    .eq("id", sessionId)
    .eq("owner_id", owner_id)

  return NextResponse.json({
    success: true,
    session_id: sessionId,
    totals,
    per_campaign: perCampaignStats,
  })
}
