import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function POST() {
  const supabase = await createClient()

  const globalWebhook = process.env.CAMPAIGN_WEBHOOK_URL
  if (!globalWebhook) {
    // No webhook configured; nothing to do
    return NextResponse.json({ success: true, message: "CAMPAIGN_WEBHOOK_URL not set; dispatcher skipped." })
  }

  // Fetch active campaigns
  const { data: campaigns, error: campErr } = await supabase
    .from("campaigns")
    .select("id, status")
    .eq("status", "active")

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 })

  for (const campaign of campaigns || []) {
    // Backfill campaign_contacts from linked batches (idempotent)
    await supabase.rpc("populate_campaign_contacts", { p_campaign: campaign.id })

    // Mark previously sent contacts as done if call exists
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

    // Pick next up to 10 pending contacts
    const { data: pendRows } = await supabase
      .from("campaign_contacts")
      .select("id, contact_id")
      .eq("campaign_id", campaign.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10)

    if (!pendRows || pendRows.length === 0) continue

    const contactIds = pendRows.map((r) => r.contact_id)
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name, email, phone, notes")
      .in("id", contactIds)

    const byId = new Map<string, any>()
    ;(contacts || []).forEach((c) => byId.set(c.id, c))

    // Prepare one batched payload with up to 10 contacts
    const payload = {
      campaign_id: campaign.id,
      contacts: pendRows.map((r) => ({ contact_id: r.contact_id, contact: byId.get(r.contact_id) || null })),
    }

    try {
      const resp = await fetch(globalWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const ids = pendRows.map((r) => r.id)
      if (!resp.ok) {
        const text = await resp.text()
        await supabase
          .from("campaign_contacts")
          .update({ status: "failed", attempts: 1, last_error: `HTTP ${resp.status}: ${text}`.slice(0, 1000) })
          .in("id", ids)
      } else {
        await supabase
          .from("campaign_contacts")
          .update({ status: "sent", attempts: 1, sent_at: new Date().toISOString() })
          .in("id", ids)
      }

      // If you still want to gently rate limit the receiving system, sleep ~10s
      await sleep(10000)
    } catch (e: any) {
      const ids = pendRows.map((r) => r.id)
      await supabase
        .from("campaign_contacts")
        .update({ status: "failed", attempts: 1, last_error: String(e).slice(0, 1000) })
        .in("id", ids)
    }
  }

  return NextResponse.json({ success: true })
}
