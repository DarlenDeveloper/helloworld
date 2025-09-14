import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Simplified seeding:
 * - Activate campaign
 * - Populate campaign_contacts from related batch_contacts WITHOUT any validation or prompts
 * - Accept all contacts as queued (status 'pending'), skip duplicates via unique(campaign_id, contact_id)
 * - Return simple counts
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const campaignId = params.id

  // Optional body is ignored; no prompts/webhooks here
  try { await req.json() } catch {}

  // Activate campaign
  const { error: upErr } = await supabase.from("campaigns").update({ status: "active" }).eq("id", campaignId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })

  // Get batches for this campaign
  const { data: campaignBatches, error: cbErr } = await supabase
    .from("campaign_batches")
    .select("batch_id")
    .eq("campaign_id", campaignId)
  if (cbErr) return NextResponse.json({ success: true, seeded: 0, warning: cbErr.message })

  const batchIds: string[] = (campaignBatches || []).map((b: any) => b.batch_id)
  if (batchIds.length === 0) return NextResponse.json({ success: true, seeded: 0 })

  // Helper
  const chunk = <T,>(arr: T[], size: number) => {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
  }

  let seeded = 0
  let skipped = 0

  for (const batchChunk of chunk(batchIds, 25)) {
    const { data: bcRows, error: bcErr } = await supabase
      .from("batch_contacts")
      .select("contact_id, batch_id")
      .in("batch_id", batchChunk)
    if (bcErr) continue

    const contactIds = Array.from(new Set((bcRows || []).map((r: any) => r.contact_id)))
    if (contactIds.length === 0) continue

    // Determine which already exist in campaign_contacts
    const { data: existing } = await supabase
      .from("campaign_contacts")
      .select("contact_id")
      .eq("campaign_id", campaignId)
      .in("contact_id", contactIds)
    const exists = new Set((existing || []).map((r: any) => r.contact_id))

    const toInsert = contactIds.filter((id) => !exists.has(id)).map((contact_id) => ({ campaign_id: campaignId, contact_id }))
    skipped += contactIds.length - toInsert.length

    for (const ins of chunk(toInsert, 1000)) {
      const { error: insErr } = await supabase.from("campaign_contacts").insert(ins)
      if (!insErr) seeded += ins.length
    }
  }

  return NextResponse.json({ success: true, seeded, skipped })
}
