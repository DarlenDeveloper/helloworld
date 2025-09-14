import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function parseChannel(desc?: string | null): "whatsapp" | "email" | "call" | null {
  const d = (desc || "").toLowerCase()
  if (d.includes("whatsapp")) return "whatsapp"
  if (d.includes("email")) return "email"
  if (d.includes("call")) return "call"
  return null
}

function parseField(desc: string | null | undefined, key: string): string | null {
  if (!desc) return null
  const re = new RegExp(`^${key}:(.*)$`, "mi")
  const m = desc.match(re)
  return m ? m[1].trim() : null
}

export async function POST() {
  const supabase = await createClient()
  const webhook = process.env.EMAIL_WEBHOOK_URL || process.env.CAMPAIGN_WEBHOOK_URL

  if (!webhook) {
    return NextResponse.json({
      success: false,
      error: "No EMAIL_WEBHOOK_URL configured; skipping dispatch.",
      hint: "Set EMAIL_WEBHOOK_URL or CAMPAIGN_WEBHOOK_URL to enable Email dispatch."
    })
  }

  // Find active Email campaigns (identified by Channel: Email in description)
  const { data: campaigns, error: campErr } = await supabase
    .from("email_campaigns")
    .select("id, status, description, webhook_url")
    .eq("status", "active")
    .order("created_at", { ascending: true })

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 })

  let totalProcessed = 0
  const stats: Array<{ campaign_id: string, seeded: number | null, sent: number, failed: number, skipped_no_email: number }> = []
  for (const camp of campaigns || []) {
    const channel = parseChannel(camp.description)
    if (channel !== "email") continue

    // Ensure queue is populated for this campaign
    let seeded: number | null = null
    try {
      const { data: seededCount, error: seedErr } = await supabase.rpc("populate_email_campaign_contacts", { p_campaign: camp.id })
      if (seedErr) {
        console.error("[email-dispatch] populate_email_campaign_contacts failed", camp.id, seedErr.message)
      } else {
        seeded = Number(seededCount ?? 0)
      }
    } catch (e: any) {
      console.error("[email-dispatch] populate_email_campaign_contacts exception", camp.id, String(e))
    }

    // Pick next up to 5 pending contacts for this campaign
    const { data: pendRows, error: pendErr } = await supabase
      .from("email_campaign_contacts")
      .select("id, contact_id")
      .eq("campaign_id", camp.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(5)

    if (pendErr) {
      // move to next campaign
      continue
    }

    if (!pendRows || pendRows.length === 0) {
      stats.push({ campaign_id: camp.id, seeded, sent: 0, failed: 0, skipped_no_email: 0 })
      continue
    }

    // Fetch the contact details in-bulk
    const contactIds = pendRows.map((r: { contact_id: string }) => r.contact_id)
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name, email, phone, notes")
      .in("id", contactIds)

    type ContactRow = { id: string; name?: string | null; email?: string | null; phone?: string | null; notes?: string | null }
    const byId = new Map<string, ContactRow>()
    ;((contacts as ContactRow[] | null) || []).forEach((c: ContactRow) => byId.set(c.id, c))

    const subject = parseField(camp.description, "Subject") || ""
    const body = parseField(camp.description, "Body") || ""
    const campaignWebhook = camp.webhook_url || webhook
    let sentCount = 0
    let failedCount = 0
    let skippedNoEmail = 0

    // Determine pacing interval (seconds)
    const intervalSecondsStr = parseField(camp.description, "IntervalSeconds") || parseField(camp.description, "RateLimitSeconds")
    const perSecStr = parseField(camp.description, "RateLimitPerSec")
    let intervalMs = 1000 // default 1 second
    if (intervalSecondsStr) {
      const s = Number(intervalSecondsStr)
      if (!Number.isNaN(s) && s > 0) intervalMs = Math.round(s * 1000)
    } else if (perSecStr) {
      const n = Number(perSecStr)
      if (!Number.isNaN(n) && n > 0) intervalMs = Math.round((1 / n) * 1000)
    }

    for (const row of pendRows) {
      const contact = byId.get(row.contact_id)
      const to = contact?.email?.trim()

      if (!to) {
        await supabase
          .from("email_campaign_contacts")
          .update({ status: "failed", attempts: 1, last_error: "Missing email for campaign" })
          .eq("id", row.id)
        skippedNoEmail += 1
        continue
      }

      try {
        const payload = {
          channel: "email",
          campaign_id: camp.id,
          contact_id: row.contact_id,
          to,
          subject,
          body,
          contact,
        }
        const resp = await fetch(campaignWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (!resp.ok) {
          const txt = await resp.text()
          await supabase
            .from("email_campaign_contacts")
            .update({ status: "failed", attempts: 1, last_error: `HTTP ${resp.status}: ${txt}`.slice(0, 1000) })
            .eq("id", row.id)
        } else {
          await supabase
            .from("email_campaign_contacts")
            .update({ status: "sent", attempts: 1, sent_at: new Date().toISOString() })
            .eq("id", row.id)
          totalProcessed += 1
          sentCount += 1
        }
      } catch (e: any) {
        await supabase
          .from("email_campaign_contacts")
          .update({ status: "failed", attempts: 1, last_error: String(e).slice(0, 1000) })
          .eq("id", row.id)
        failedCount += 1
      }

      // Enforce configurable pacing between each email
      await sleep(intervalMs)
    }
  
    stats.push({ campaign_id: camp.id, seeded, sent: sentCount, failed: failedCount, skipped_no_email: skippedNoEmail })
  }

  return NextResponse.json({ success: true, processed: totalProcessed, diagnostics: stats })
}
