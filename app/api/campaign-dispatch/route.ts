import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Simple dispatcher that:
 * - Creates one session row
 * - Processes up to 10 contacts (pending) per request across active campaigns
 * - For each processed contact, inserts one dispatch_events row
 * - Marks that contact as 'sent'
 * - Repeats on next request until all contacts are done
 *
 * No validation, no webhooks, no complex scheduling. Each request handles at most 10.
 */
const CONTACTS_PER_REQUEST = 10

export async function POST() {
  const supabase = await createClient()

  // Resolve owner for RLS
  let owner_id: string | null = null
  try {
    const { data } = await (supabase as any).auth.getUser?.()
    owner_id = data?.user?.id || null
  } catch {}
  if (!owner_id) {
    return NextResponse.json({ success: false, error: "Unauthenticated; cannot insert rows" }, { status: 401 })
  }

  // Create session
  const { data: sessIns, error: sessErr } = await supabase
    .from("dispatch_sessions")
    .insert([{ owner_id, channel: "call", config: { CONTACTS_PER_REQUEST } }])
    .select("id")
    .single()
  if (sessErr) return NextResponse.json({ success: false, error: sessErr.message }, { status: 500 })
  const session_id = (sessIns as any)?.id as string

  // Load active campaigns
  const { data: campaigns, error: campErr } = await supabase
    .from("campaigns")
    .select("id")
    .eq("status", "active")
  if (campErr) return NextResponse.json({ success: false, error: campErr.message }, { status: 500 })

  // Collect up to CONTACTS_PER_REQUEST pending rows across all campaigns (oldest-first per campaign)
  type CCRow = { id: string; contact_id: string; campaign_id: string }
  const selected: CCRow[] = []

  for (const camp of campaigns || []) {
    if (selected.length >= CONTACTS_PER_REQUEST) break
    const limit = CONTACTS_PER_REQUEST - selected.length
    const { data: rows } = await supabase
      .from("campaign_contacts")
      .select("id, contact_id, campaign_id")
      .eq("campaign_id", camp.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit)
    ;(rows || []).forEach((r: any) => selected.push(r as CCRow))
  }

  let attempted = 0
  let recorded = 0
  let errored = 0

  // For each selected, create a simple attempt row and mark as sent
  for (const row of selected) {
    attempted += 1

    // Load minimal contact (accept any phone/email as-is)
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, name, email, phone, notes")
      .eq("id", row.contact_id)
      .limit(1)
      .single()

    const target = ((contact?.phone || contact?.email || "") as string).toString()

    // Insert attempt
    const payload = {
      channel: "call",
      campaign_id: row.campaign_id,
      contact_id: row.contact_id,
      target,
      contact,
    }

    const { error: insErr } = await supabase
      .from("dispatch_events")
      .insert([{
        session_id,
        owner_id,
        campaign_id: row.campaign_id,
        contact_id: row.contact_id,
        channel: "call",
        action: "sent",
        detail: payload,
      }])

    if (insErr) {
      errored += 1
      await supabase.from("dispatch_events").insert([{
        session_id,
        owner_id,
        campaign_id: row.campaign_id,
        contact_id: row.contact_id,
        channel: "call",
        action: "failed",
        detail: { error: insErr.message, payload },
      }])
      continue
    }

    recorded += 1
    // Mark queue row as sent
    await supabase
      .from("campaign_contacts")
      .update({ status: "sent", attempts: 1, sent_at: new Date().toISOString() })
      .eq("id", row.id)
  }

  // Compute remaining queued across active campaigns
  let remaining = 0
  for (const camp of campaigns || []) {
    const { count } = await supabase
      .from("campaign_contacts")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", camp.id)
      .eq("status", "pending")
    remaining += count || 0
  }

  // Update session totals
  await supabase
    .from("dispatch_sessions")
    .update({ ended_at: new Date().toISOString(), totals: { attempted, recorded, errored, remaining } })
    .eq("id", session_id)
    .eq("owner_id", owner_id)

  return NextResponse.json({
    success: true,
    session_id,
    processed_this_request: selected.length,
    attempted,
    recorded,
    errored,
    remaining_pending: remaining,
    hint: "Call this endpoint repeatedly until remaining_pending is 0."
  })
}
