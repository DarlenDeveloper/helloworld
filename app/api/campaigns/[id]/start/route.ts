import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isValidPhone, normalizePhone } from "@/lib/phone"

/**
 * Start/seed campaign:
 * - Activate campaign and optionally set campaign-specific webhook_url
 * - Populate campaign_contacts from batch_contacts for this campaign, idempotently
 * - Apply unified phone normalization/validation and mark invalid upfront
 * - Avoid RPC RETURN issues by not using RPCs; use set-based selects + batched inserts
 * - Ensure queued vs invalid counts are accurate
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const campaignId = params.id

  // parse optional webhook_url
  let webhook_url: unknown = undefined
  try {
    const body = await req.json()
    webhook_url = body?.webhook_url
  } catch {
    // no body provided; optional
  }

  // 1) Activate campaign (and optionally set webhook_url)
  const update: any = { status: "active" }
  if (typeof webhook_url === "string" && webhook_url.trim().length > 0) {
    update.webhook_url = webhook_url.trim()
  }
  const { error: upErr } = await supabase.from("campaigns").update(update).eq("id", campaignId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })

  // 2) Discover batches for this campaign
  const { data: campaignBatches, error: cbErr } = await supabase
    .from("campaign_batches")
    .select("batch_id")
    .eq("campaign_id", campaignId)

  if (cbErr) {
    return NextResponse.json({ success: true, warning: "Failed to load campaign batches for seeding", details: cbErr.message })
  }
  const batchIds: string[] = (campaignBatches || []).map((b: any) => b.batch_id)
  if (batchIds.length === 0) {
    return NextResponse.json({ success: true, seeded: 0, invalid: 0, skipped_duplicates: 0 })
  }

  // helper
  const chunk = <T,>(arr: T[], size: number) => {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
  }

  // 3) Load batch_contacts for these batches
  // We need phone numbers and opted_out flags to validate. Pull contacts.
  let insertedQueued = 0
  let insertedInvalid = 0
  let skippedDuplicates = 0

  for (const batchChunk of chunk(batchIds, 25)) {
    const { data: bcRows, error: bcErr } = await supabase
      .from("batch_contacts")
      .select("contact_id, batch_id")
      .in("batch_id", batchChunk)

    if (bcErr) continue
    const contactIds = Array.from(new Set((bcRows || []).map((r: any) => r.contact_id)))
    if (contactIds.length === 0) continue

    // Fetch contacts
    const { data: contacts, error: cErr } = await supabase
      .from("contacts")
      .select("id, phone, opted_out")
      .in("id", contactIds)

    if (cErr) continue

    // Already present in campaign_contacts?
    const { data: existing, error: eErr } = await supabase
      .from("campaign_contacts")
      .select("contact_id, status")
      .eq("campaign_id", campaignId)
      .in("contact_id", contactIds)

    if (eErr) continue
    const existingById = new Map<string, string>((existing || []).map((r: any) => [r.contact_id, r.status]))

    // Build inserts grouped by intended status
    const toQueue: Array<{ campaign_id: string; contact_id: string }> = []
    const toInvalid: Array<{ campaign_id: string; contact_id: string; last_error: string; status: string }> = []

    for (const c of contacts || []) {
      if (existingById.has(c.id)) {
        skippedDuplicates += 1
        continue
      }
      const normalized = normalizePhone(c.phone)
      const valid = !!normalized && isValidPhone(normalized)
      const optedOut = !!c.opted_out

      if (!valid || optedOut) {
        toInvalid.push({
          campaign_id: campaignId,
          contact_id: c.id,
          last_error: !valid ? "Invalid phone" : "Opted out",
          status: "failed", // mark as failed to surface on UI invalid bucket
        })
      } else {
        toQueue.push({ campaign_id: campaignId, contact_id: c.id })
      }
    }

    // Insert queued
    for (const insChunk of chunk(toQueue, 1000)) {
      const { error: insErr } = await supabase.from("campaign_contacts").insert(insChunk)
      if (!insErr) insertedQueued += insChunk.length
    }

    // Insert invalid as 'failed' with reason
    for (const invChunk of chunk(toInvalid, 1000)) {
      const { error: invErr } = await supabase.from("campaign_contacts").insert(invChunk as any)
      if (!invErr) insertedInvalid += invChunk.length
    }
  }

  // Note: Unique index on (campaign_id, contact_id) enforces idempotency. We count duplicates as skipped.
  return NextResponse.json({
    success: true,
    seeded_queued: insertedQueued,
    seeded_invalid: insertedInvalid,
    skipped_duplicates: skippedDuplicates
  })
}
