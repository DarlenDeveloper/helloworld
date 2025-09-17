import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { VapiClient } from "@/lib/api/vapi"

// Vapi requires campaign creation with customers; we send up to 500 per campaign
const MAX_PER_CAMPAIGN = 500

function envTrim(name: string): string | undefined {
  const v = process.env[name]
  if (!v) return undefined
  const s = v.toString().trim()
  return s.length ? s : undefined
}

function requiredEnv(): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  if (!envTrim("VAPI_API_KEY")) missing.push("VAPI_API_KEY")
  if (!envTrim("VAPI_PHONE_NUMBER_ID")) missing.push("VAPI_PHONE_NUMBER_ID")
  const hasAssistant = !!envTrim("VAPI_ASSISTANT_ID")
  const hasWorkflow = !!envTrim("VAPI_WORKFLOW_ID")
  if (!hasAssistant && !hasWorkflow) missing.push("VAPI_ASSISTANT_ID or VAPI_WORKFLOW_ID")
  return { ok: missing.length === 0, missing }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function GET() {
  // Auth check for RLS scope (same as before)
  const supabase = await createClient()
  let owner_id: string | null = null
  try {
    const { data } = await (supabase as any).auth.getUser?.()
    owner_id = data?.user?.id || null
  } catch {}

  if (!owner_id) {
    return NextResponse.json({ ready: false, error: "No authenticated user" }, { status: 401 })
  }

  const envs = requiredEnv()
  if (!envs.ok) {
    return NextResponse.json({ ready: false, provider: "airies", missing: envs.missing })
  }
  return NextResponse.json({ ready: true, provider: "airies" })
}

export async function POST(req: Request) {
  const supabase = await createClient()

  // Resolve owner for RLS and data access
  let owner_id: string | null = null
  try {
    const { data } = await (supabase as any).auth.getUser?.()
    owner_id = data?.user?.id || null
  } catch {}
  if (!owner_id) {
    return NextResponse.json({ success: false, error: "No authenticated user for RLS" }, { status: 401 })
  }

  // Validate env readiness
  const envs = requiredEnv()
  if (!envs.ok) {
    return NextResponse.json({ success: false, error: `Missing env: ${envs.missing.join(", ")}` }, { status: 500 })
  }

  // Parse body
  let batch_id: string | null = null
  let assistantId: string | undefined
  let workflowId: string | undefined
  let schedulePlan: { earliestAt?: string; latestAt?: string } | undefined
  try {
    const body = await req.json().catch(() => ({}))
    batch_id = typeof body?.batch_id === "string" ? body.batch_id : null
    assistantId = typeof body?.assistantId === "string" ? body.assistantId : envTrim("VAPI_ASSISTANT_ID")
    workflowId = typeof body?.workflowId === "string" ? body.workflowId : envTrim("VAPI_WORKFLOW_ID")
    schedulePlan = body?.schedulePlan
    if (!schedulePlan) {
      const earliestAt = envTrim("VAPI_SCHEDULE_EARLIEST_AT")
      const latestAt = envTrim("VAPI_SCHEDULE_LATEST_AT")
      if (earliestAt || latestAt) schedulePlan = { earliestAt, latestAt }
    }
  } catch {}

  if (!batch_id) {
    return NextResponse.json({ success: false, error: "batch_id is required" }, { status: 400 })
  }
  if (assistantId && workflowId) {
    return NextResponse.json({ success: false, error: "Provide either assistantId or workflowId (not both)" }, { status: 400 })
  }

  // Fetch batch for naming + ownership
  const { data: batchRow, error: batchErr } = await supabase
    .from("contact_batches")
    .select("id, user_id, name, description, contact_count")
    .eq("id", batch_id)
    .single()

  if (batchErr || !batchRow) {
    return NextResponse.json({ success: false, error: batchErr?.message || "Batch not found" }, { status: 404 })
  }
  if ((batchRow as any).user_id !== owner_id) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  // Fetch all contacts for this batch (paged)
  type SnapRow = { contact_id: string; phone: string | null; name: string | null; email: string | null }
  const pageSize = 1000
  let offset = 0
  const snapshots: SnapRow[] = []
  while (true) {
    const { data, error } = await supabase
      .from("batch_contacts")
      .select("contact_id, phone, name, email")
      .eq("batch_id", batch_id)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    const rows = (data || []) as SnapRow[]
    snapshots.push(...rows)
    if (rows.length < pageSize) break
    offset += pageSize
  }

  if (snapshots.length === 0) {
    return NextResponse.json({ success: true, provider: "airies", campaigns: [], totals: { contacts: 0, campaigns: 0 } })
  }

  // Build customers (accept numbers as-is; enable E164 check in provider)
  const customers = snapshots.map((r) => ({
    number: (r.phone || "").toString().trim() || undefined,
    name: r.name || undefined,
    email: r.email || undefined,
    externalId: r.contact_id,
    numberE164CheckEnabled: true,
  }))

  // Chunk into 500/customer campaigns
  const chunks = chunk(customers, MAX_PER_CAMPAIGN)
  const baseName: string = (batchRow as any).name || batch_id

  const vapi = new VapiClient()
  const created: Array<{ id: string; name: string; count: number }> = []
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]
    const ts = new Date().toISOString()
    const campaignName = `${baseName} — ${ts}${chunks.length > 1 ? ` — part ${i + 1}` : ""}`
    const resp = await vapi.createCampaign({
      name: campaignName,
      customers: c,
      assistantId,
      workflowId,
      schedulePlan,
    })
    created.push({ id: resp.id, name: resp.name, count: c.length })
  }

  return NextResponse.json({
    success: true,
    provider: "airies",
    campaigns: created,
    totals: { contacts: customers.length, campaigns: created.length },
  })
}
