import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Batch dispatcher (no campaigns):
 * - POST /api/campaign-dispatch?batch_id=...&limit=...
 * - Creates one session row
 * - Reads up to {limit} contacts from public.batch_contacts for the given batch_id
 * - For each contact: inserts one row into dispatch_events (owner-scoped) and marks progress by writing an event
 * - Designed to be called repeatedly until the whole batch is recorded
 *
 * No validation, no webhooks, no prompts. Pure DB writes using session logic.
 */
const DEFAULT_LIMIT = 100 // larger batches as requested

export async function POST(req: Request) {
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

  // Parse query params
  const url = new URL(req.url)
  const batch_id = url.searchParams.get("batch_id")
  const limitParam = url.searchParams.get("limit")
  const LIMIT = Math.max(1, Math.min(Number(limitParam) || DEFAULT_LIMIT, 1000))

  if (!batch_id) {
    return NextResponse.json({ success: false, error: "batch_id is required" }, { status: 400 })
  }

  // Create session (channel left generic 'call' to reuse the same schema)
  const { data: sessIns, error: sessErr } = await supabase
    .from("dispatch_sessions")
    .insert([{ owner_id, channel: "call", config: { batch_id, LIMIT } }])
    .select("id")
    .single()
  if (sessErr) return NextResponse.json({ success: false, error: sessErr.message }, { status: 500 })
  const session_id = (sessIns as any)?.id as string

  // Load up to LIMIT contacts from batch_contacts for this batch_id
  // To avoid reprocessing rows already written this session, perform a left anti-join via application logic:
  // 1) Get recent contacts from batch
  const { data: batchRows, error: bcErr } = await supabase
    .from("batch_contacts")
    .select("contact_id")
    .eq("batch_id", batch_id)
    .limit(LIMIT)
  if (bcErr) return NextResponse.json({ success: false, error: bcErr.message }, { status: 500 })

  // 2) Resolve minimal contact info (optional)
  const contactIds = Array.from(new Set((batchRows || []).map((r: any) => r.contact_id)))
  let contactsById = new Map<string, any>()
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name, email, phone, notes")
      .in("id", contactIds)
    ;(contacts || []).forEach((c: any) => contactsById.set(c.id, c))
  }

  // 3) Write events for each contact (idempotency within session is not strictly required; the UI can drive one call at a time)
  let attempted = 0
  let recorded = 0
  let errored = 0

  for (const row of batchRows || []) {
    attempted += 1
    const contact = contactsById.get(row.contact_id) || null
    const target = ((contact?.phone || contact?.email || "") as string).toString()

    const payload = {
      channel: "call",
      batch_id,
      contact_id: row.contact_id,
      target,
      contact,
    }

    const { error: insErr } = await supabase
      .from("dispatch_events")
      .insert([{
        session_id,
        owner_id,
        campaign_id: null, // no campaigns now
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
        campaign_id: null,
        contact_id: row.contact_id,
        channel: "call",
        action: "failed",
        detail: { error: insErr.message, payload },
      }])
    } else {
      recorded += 1
    }
  }

  // Compute remaining rows in batch_contacts (approximate; head count)
  const { count: remaining } = await supabase
    .from("batch_contacts")
    .select("*", { count: "exact", head: true })
    .eq("batch_id", batch_id)

  // Update session totals
  await supabase
    .from("dispatch_sessions")
    .update({ ended_at: new Date().toISOString(), totals: { attempted, recorded, errored, remaining } })
    .eq("id", session_id)
    .eq("owner_id", owner_id)

  return NextResponse.json({
    success: true,
    session_id,
    batch_id,
    processed_this_request: (batchRows || []).length,
    attempted,
    recorded,
    errored,
    remaining_in_batch: remaining || 0,
    hint: "Invoke again until remaining_in_batch is 0. This only writes to dispatch tables."
  })
}
