import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { VapiClient, buildVapiCustomersFromQueueRows } from "@/lib/api/vapi"

// Hard cap per requirements
const MAX_PER_CAMPAIGN = 500

function envTrim(name: string): string | undefined {
  const v = process.env[name]
  if (!v) return undefined
  const s = v.toString().trim()
  return s.length ? s : undefined
}

export async function POST(req: Request) {
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

  const body = await req.json().catch(() => ({}))
  const batch_id = typeof body?.batch_id === "string" ? body.batch_id : null
  let assistantId = typeof body?.assistantId === "string" ? body.assistantId : undefined
  let workflowId = typeof body?.workflowId === "string" ? body.workflowId : undefined
  let schedulePlan = body?.schedulePlan as { earliestAt?: string; latestAt?: string } | undefined

  if (!batch_id) {
    return NextResponse.json({ success: false, error: "batch_id is required" }, { status: 400 })
  }

  // Default assistant/workflow and schedule from env if not provided in request
  if (!assistantId && !workflowId) {
    assistantId = envTrim("VAPI_ASSISTANT_ID")
    if (!assistantId) workflowId = envTrim("VAPI_WORKFLOW_ID")
  }
  if (!schedulePlan) {
    const earliestAt = envTrim("VAPI_SCHEDULE_EARLIEST_AT")
    const latestAt = envTrim("VAPI_SCHEDULE_LATEST_AT")
    if (earliestAt || latestAt) schedulePlan = { earliestAt, latestAt }
  }
  if (assistantId && workflowId) {
    return NextResponse.json({ success: false, error: "Provide either assistantId or workflowId (not both)" }, { status: 400 })
  }

  // Fetch batch for naming context
  const { data: batchRow, error: batchErr } = await supabase
    .from("contact_batches")
    .select("id, name, description, contact_count")
    .eq("id", batch_id)
    .single()

  if (batchErr || !batchRow) {
    return NextResponse.json({ success: false, error: batchErr?.message || "Batch not found" }, { status: 404 })
  }

  const baseName: string = (batchRow as any).name || batch_id

  const campaigns: Array<{ id: string; name: string; count: number }> = []
  let totalQueuedProcessed = 0
  let cycles = 0

  while (true) {
    // Pull next chunk (oldest first) for this owner+batch
    const { data: qRows, error: qErr } = await supabase
      .from("call_scheduling_queue")
      .select("id, session_id, owner_id, batch_id, contact_id, target_phone, payload, created_at")
      .eq("owner_id", owner_id)
      .eq("batch_id", batch_id)
      .order("created_at", { ascending: true })
      .limit(MAX_PER_CAMPAIGN)

    if (qErr) {
      return NextResponse.json({ success: false, error: qErr.message }, { status: 500 })
    }

    const rows = qRows || []
    if (rows.length === 0) break

    const customers = buildVapiCustomersFromQueueRows(
      rows.map((r: any) => ({ target_phone: r.target_phone, contact_id: r.contact_id, payload: r.payload }))
    )

    const stamp = new Date().toISOString()
    const campaignName = `${baseName} — ${stamp}${cycles > 0 ? ` — part ${cycles + 1}` : ""}`

    try {
      const vapi = new VapiClient()
      const resp = await vapi.createCampaign({
        name: campaignName,
        customers,
        assistantId,
        workflowId,
        schedulePlan,
      })

      // Delete only this chunk's queue rows after success
      const qIds = rows.map((r: any) => r.id)
      const { error: delErr } = await supabase
        .from("call_scheduling_queue")
        .delete()
        .in("id", qIds)

      // Session-level log for traceability (if present)
      const sessionId = rows[0]?.session_id as string | undefined
      if (sessionId) {
        await supabase.from("call_scheduling_logs").insert([{
          session_id: sessionId,
          owner_id,
          contact_id: null,
          action: "enqueued",
          detail: { provider: "airies", campaignId: resp.id, name: resp.name, count: customers.length, deleteError: delErr?.message },
        }])
      }

      campaigns.push({ id: resp.id, name: resp.name, count: customers.length })
      totalQueuedProcessed += rows.length
      cycles += 1

      // If less than max pulled, we've drained the queue
      if (rows.length < MAX_PER_CAMPAIGN) break
    } catch (e: any) {
      // Log failure (do not delete rows on failure)
      const sessionId = rows[0]?.session_id as string | undefined
      if (sessionId) {
        await supabase.from("call_scheduling_logs").insert([{
          session_id: sessionId,
          owner_id,
          contact_id: null,
          action: "failed",
          detail: { provider: "airies", error: String(e?.message || e), status: e?.status, raw: e?.raw },
        }])
      }
      return NextResponse.json({ success: false, error: e?.message || "Failed to create campaign" }, { status: 502 })
    }
  }

  return NextResponse.json({ success: true, campaigns, totalQueuedProcessed })
}
