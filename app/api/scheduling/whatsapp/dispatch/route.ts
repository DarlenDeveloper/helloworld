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

/**
 * WhatsApp dispatcher (DB-persisted attempts; no webhooks)
 * - Accept any phone string as-is (no validation/normalization)
 * - Create a dispatch session for channel 'whatsapp'
 * - For each pending contact, write a dispatch_events row (action='sent') and update queue to 'sent'
 * - Errors are recorded as action='failed' but do not throw
 */
export async function POST() {
  const supabase = await createClient()

  // Resolve owner for RLS
  let owner_id: string | null = null
  try {
    const { data } = await (supabase as any).auth.getUser?.()
    owner_id = data?.user?.id || null
  } catch {}

  if (!owner_id) {
    return NextResponse.json({ success: false, error: "No authenticated user for RLS" }, { status: 401 })
  }

  // Active WhatsApp campaigns
  const { data: campaigns, error: campErr } = await supabase
    .from("whatsapp_campaigns")
    .select("id, status, description")
    .eq("status", "active")
    .order("created_at", { ascending: true })

  if (campErr) return NextResponse.json({ success: false, error: campErr.message }, { status: 500 })

  // Create session
  const config = { note: "whatsapp-session" }
  const { data: sessIns, error: sessErr } = await supabase
    .from("dispatch_sessions")
    .insert([{ owner_id, channel: "whatsapp", config }])
    .select("id")
    .single()
  if (sessErr) return NextResponse.json({ success: false, error: sessErr.message }, { status: 500 })
  const sessionId = (sessIns as any)?.id as string

  let totalAttempted = 0
  let totalRecorded = 0
  let totalErrored = 0
  const stats: Array<{ campaign_id: string, attempted: number, recorded: number, errored: number }> = []

  for (const camp of campaigns || []) {
    const channel = parseChannel(camp.description)
    if (channel !== "whatsapp") continue

    const { data: pendRows, error: pendErr } = await supabase
      .from("whatsapp_campaign_contacts")
      .select("id, contact_id")
      .eq("campaign_id", camp.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(5)

    if (pendErr) continue
    if (!pendRows || pendRows.length === 0) {
      stats.push({ campaign_id: camp.id, attempted: 0, recorded: 0, errored: 0 })
      continue
    }

    const contactIds = pendRows.map((r: { contact_id: string }) => r.contact_id)
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name, email, phone, notes")
      .in("id", contactIds)

    type ContactRow = { id: string; name?: string | null; email?: string | null; phone?: string | null; notes?: string | null }
    const byId = new Map<string, ContactRow>()
    ;(contacts as ContactRow[] | null || []).forEach((c: ContactRow) => byId.set(c.id, c))

    const prompt = parseField(camp.description, "Prompt") || ""
    let attempted = 0
    let recorded = 0
    let errored = 0

    for (const row of pendRows) {
      attempted += 1
      totalAttempted += 1
      const contact = byId.get(row.contact_id)
      const target = (contact?.phone || "").toString().trim() // accept any

      const payload = {
        channel: "whatsapp",
        campaign_id: camp.id,
        contact_id: row.contact_id,
        target,
        prompt,
        contact,
      }

      try {
        const { error: insErr } = await supabase
          .from("dispatch_events")
          .insert([{
            session_id: sessionId,
            owner_id,
            campaign_id: camp.id,
            contact_id: row.contact_id,
            channel: "whatsapp",
            action: "sent",
            detail: payload,
          }])

        if (insErr) {
          errored += 1
          totalErrored += 1
          await supabase.from("dispatch_events").insert([{
            session_id: sessionId,
            owner_id,
            campaign_id: camp.id,
            contact_id: row.contact_id,
            channel: "whatsapp",
            action: "failed",
            detail: { error: insErr.message, payload },
          }])
        } else {
          recorded += 1
          totalRecorded += 1
          await supabase
            .from("whatsapp_campaign_contacts")
            .update({ status: "sent", attempts: 1, sent_at: new Date().toISOString() })
            .eq("id", row.id)
        }
      } catch (e: any) {
        errored += 1
        totalErrored += 1
        await supabase.from("dispatch_events").insert([{
          session_id: sessionId,
          owner_id,
          campaign_id: camp.id,
          contact_id: row.contact_id,
          channel: "whatsapp",
          action: "failed",
          detail: { error: String(e), payload },
        }])
      }

      await sleep(1000) // pacing
    }

    stats.push({ campaign_id: camp.id, attempted, recorded, errored })
  }

  // Close session
  await supabase
    .from("dispatch_sessions")
    .update({ ended_at: new Date().toISOString(), totals: { attempted: totalAttempted, recorded: totalRecorded, errored: totalErrored } })
    .eq("id", sessionId)
    .eq("owner_id", owner_id)

  return NextResponse.json({ success: true, session_id: sessionId, totals: { attempted: totalAttempted, recorded: totalRecorded, errored: totalErrored }, diagnostics: stats })
}
