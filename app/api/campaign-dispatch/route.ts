import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function POST() {
  const supabase = createClient()

  // Fetch active campaigns with webhook
  const { data: campaigns, error: campErr } = await supabase
    .from("campaigns")
    .select("id, webhook_url, status")
    .eq("status", "active")

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 })

  for (const campaign of campaigns || []) {
    if (!campaign.webhook_url) continue

    // Optional backfill: ensure queue accounts for all linked batch contacts
    await supabase.rpc("populate_campaign_contacts", { p_campaign: campaign.id })

    // Mark sent as done if call exists
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

    // Next 10 pending
    const { data: pendRows } = await supabase
      .from("campaign_contacts")
      .select("id, contact_id")
      .eq("campaign_id", campaign.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10)

    if (!pendRows || pendRows.length === 0) continue

    // Load contact details
    const contactIds = pendRows.map((r) => r.contact_id)
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name, email, phone, notes")
      .in("id", contactIds)

    const byId = new Map<string, any>()
    ;(contacts || []).forEach((c) => byId.set(c.id, c))

    // Dispatch
    for (const row of pendRows) {
      const payload = {
        campaign_id: campaign.id,
        contact_id: row.contact_id,
        contact: byId.get(row.contact_id) || null,
      }

      try {
        const resp = await fetch(campaign.webhook_url!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (!resp.ok) {
          const text = await resp.text()
          await supabase
            .from("campaign_contacts")
            .update({ status: "failed", attempts: 1, last_error: `HTTP ${resp.status}: ${text}`.slice(0, 1000) })
            .eq("id", row.id)
        } else {
          await supabase
            .from("campaign_contacts")
            .update({ status: "sent", attempts: 1, sent_at: new Date().toISOString() })
            .eq("id", row.id)
        }
      } catch (e: any) {
        await supabase
          .from("campaign_contacts")
          .update({ status: "failed", attempts: 1, last_error: String(e).slice(0, 1000) })
          .eq("id", row.id)
      }

      // 1 per second
      await sleep(1000)
    }
  }

  return NextResponse.json({ success: true })
}
