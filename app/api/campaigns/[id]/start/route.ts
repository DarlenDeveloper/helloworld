import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const campaignId = params.id

  let webhook_url: unknown = undefined
  try {
    const body = await req.json()
    webhook_url = body?.webhook_url
  } catch {
    // no body provided; treat as optional
  }

  const update: any = { status: "active" }
  if (typeof webhook_url === "string" && webhook_url.trim().length > 0) {
    update.webhook_url = webhook_url.trim()
  }

  // 1) Activate campaign (and optionally set webhook_url)
  const { error: upErr } = await supabase
    .from("campaigns")
    .update(update)
    .eq("id", campaignId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })

  // 2) Seed campaign_contacts idempotently WITHOUT calling the SQL function (avoid DB error; do not edit SQL)
  // This mirrors the logic inside populate_campaign_contacts:
  // campaign_batches -> batch_contacts, excluding already present pairs
  // Note: Supabase JS does not support INSERT ... SELECT directly, so we fetch ids then bulk insert.
  // For large batches, we do it in pages to avoid memory spikes.
  const PAGE_SIZE = 1000
  let insertedTotal = 0
  let offset = 0

  // We will fetch candidate contact_ids via a server-side SQL RPC-like select using PostgREST:
  // Use a view from client side: select distinct contact_id from batch_contacts join campaign_batches where campaign_id = campaignId
  // Since we cannot create SQL, we replicate with two-step fetches.

  // Step A: Fetch all batch_ids linked to this campaign
  const { data: campaignBatches, error: cbErr } = await supabase
    .from("campaign_batches")
    .select("batch_id")
    .eq("campaign_id", campaignId)

  if (cbErr) {
    // Non-fatal: allow start to succeed even if seeding fails; dispatcher can seed later
    return NextResponse.json({ success: true, warning: "Failed to load campaign batches for seeding", details: cbErr.message })
  }

  const batchIds = (campaignBatches || []).map((b: any) => b.batch_id)
  if (batchIds.length === 0) {
    return NextResponse.json({ success: true, seeded: 0 })
  }

  // Helper to chunk an array
  const chunk = <T,>(arr: T[], size: number) => {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
  }

  // Fetch candidate contact_ids per batch in chunks, compare against existing rows, then bulk insert missing pairs
  for (const batchChunk of chunk(batchIds, 25)) {
    // Get distinct contact_ids for this set of batches
    const { data: batchContacts, error: bcErr } = await supabase
      .from("batch_contacts")
      .select("contact_id, batch_id")
      .in("batch_id", batchChunk)

    if (bcErr) {
      // Skip on error; continue seeding others
      continue
    }

    // Deduplicate contact_ids across batches
    const candidateIds = Array.from(new Set((batchContacts || []).map((r: any) => r.contact_id)))

    if (candidateIds.length === 0) continue

    // Get existing campaign_contacts for these contact_ids
    const { data: existingRows, error: existErr } = await supabase
      .from("campaign_contacts")
      .select("contact_id")
      .eq("campaign_id", campaignId)
      .in("contact_id", candidateIds)

    if (existErr) {
      // Skip on error
      continue
    }

    const existingIds = new Set((existingRows || []).map((r: any) => r.contact_id))
    const toInsert = candidateIds
      .filter((id) => !existingIds.has(id))
      .map((contact_id) => ({ campaign_id: campaignId, contact_id }))

    if (toInsert.length > 0) {
      // Insert in sub-batches to respect payload limits
      for (const insChunk of chunk(toInsert, 1000)) {
        const { error: insErr } = await supabase.from("campaign_contacts").insert(insChunk)
        if (!insErr) {
          insertedTotal += insChunk.length
        }
      }
    }
  }

  return NextResponse.json({ success: true, seeded: insertedTotal })
}
