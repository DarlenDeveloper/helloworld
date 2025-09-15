import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// "Acceptable but not enforced": country code (+) followed by at least 9 more digits (i.e., +CC + 9 local digits = 10+ total digits)
const CC_PLUS_9_REGEX = /^\+\d{10,}$/

export async function GET() {
  const supabase = await createClient()

  // Resolve owner for RLS
  let owner_id: string | null = null
  try {
    const { data } = await (supabase as any).auth.getUser?.()
    owner_id = data?.user?.id || null
  } catch {}

  if (!owner_id) {
    return NextResponse.json({ ready: false, error: "No authenticated user for RLS" }, { status: 401 })
  }

  // Probe table readiness. If migrations aren't applied yet, we return ready: false
  const { error: e1 } = await supabase.from("call_scheduling_sessions").select("id").limit(1)
  const { error: e2 } = await supabase.from("call_scheduling_queue").select("id").limit(1)
  const { error: e3 } = await supabase.from("call_scheduling_logs").select("id").limit(1)
  const ready = !e1 && !e2 && !e3

  if (!ready) {
    return NextResponse.json({ ready: false, migration: "scripts/simple_auth/015_call_scheduling.sql" })
  }
  return NextResponse.json({ ready: true })
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

  let batch_id: string | null = null
  let limit: number = 10
  try {
    const body = await req.json().catch(() => ({}))
    batch_id = typeof body?.batch_id === "string" ? body.batch_id : null
    // limit is optional; hard-cap to 10 per session per spec
    const requested = Number(body?.limit)
    if (!Number.isNaN(requested) && requested > 0) {
      limit = Math.min(10, Math.max(1, Math.floor(requested)))
    }
  } catch {
    // ignore body parse errors; we'll validate below
  }

  if (!batch_id) {
    return NextResponse.json({ success: false, error: "batch_id is required" }, { status: 400 })
  }

  // Optional: verify the batch exists (RLS ensures visibility)
  const { data: batchRow, error: batchErr } = await supabase
    .from("contact_batches")
    .select("id, user_id, name, contact_count")
    .eq("id", batch_id)
    .single()

  if (batchErr || !batchRow) {
    return NextResponse.json({ success: false, error: batchErr?.message || "Batch not found" }, { status: 404 })
  }

   // Probe if temporary tables exist; fallback to dispatch_events if not ready
   const { error: probeErr } = await supabase
     .from("call_scheduling_sessions")
     .select("id")
     .limit(1)
  
   if (probeErr) {
     // Fallback mode: use dispatch_sessions/dispatch_events to record activity before migration is applied
     const { data: fbSessIns, error: fbSessErr } = await supabase
       .from("dispatch_sessions")
       .insert([{ owner_id, channel: "call", config: { note: "call-fallback-session" } }])
       .select("id")
       .single()
     if (fbSessErr || !fbSessIns) {
       return NextResponse.json({ success: false, error: fbSessErr?.message || "Failed to create fallback session" }, { status: 500 })
     }
     const fbSessionId = (fbSessIns as any).id as string
  
     // Fetch contacts (no dedupe across sessions in fallback)
     const { data: fbRows, error: fbSelErr } = await supabase
       .from("batch_contacts")
       .select("id, contact_id, phone, name, email, notes")
       .eq("batch_id", batch_id)
       .order("created_at", { ascending: true })
       .limit(limit)
  
     if (fbSelErr) {
       return NextResponse.json({ success: false, error: fbSelErr.message }, { status: 500 })
     }
  
     let enqueued = 0
     let errored = 0
     const contacts = fbRows || []
     for (let i = 0; i < contacts.length; i++) {
       const r = contacts[i]
       const target = (r as any)?.phone?.toString?.().trim?.() || null
       try {
         const { error: insErr } = await supabase
           .from("dispatch_events")
           .insert([{
             session_id: fbSessionId,
             owner_id,
             campaign_id: batch_id, // reuse batch_id as correlation id (no FK on dispatch_events.campaign_id)
             contact_id: r.contact_id,
             channel: "call",
             action: "sent",
             detail: { phone: target, name: (r as any)?.name ?? null, batch_id },
           }])
         if (insErr) {
           errored += 1
         } else {
           enqueued += 1
         }
       } catch {
         errored += 1
       }
       await sleep(3000) // pacing
     }
  
     return NextResponse.json({
       success: true,
       session_id: fbSessionId,
       totals: { enqueued, skipped: 0, errored },
       fallback: true,
       note: "Temporary tables not ready; recorded to dispatch_events as fallback",
     })
   }
  
   // Create session (normal path using temporary tables)
   const { data: sessIns, error: sessErr } = await supabase
     .from("call_scheduling_sessions")
     .insert([{ owner_id, batch_id, status: "running" }])
     .select("id, created_at")
     .single()
  
   if (sessErr || !sessIns) {
     return NextResponse.json({ success: false, error: sessErr?.message || "Failed to create session" }, { status: 500 })
   }
   const session_id = (sessIns as any).id as string

  // De-duplicate against already-queued contacts for this batch and select next slice
  const { data: alreadyQ } = await supabase
    .from("call_scheduling_queue")
    .select("contact_id")
    .eq("batch_id", batch_id)
    .limit(50000)

  const queuedSet = new Set<string>(((alreadyQ as any[] | null) || []).map((x: any) => x.contact_id))

  // Scan a larger window then filter in-app to avoid duplicates, finally slice to "limit"
  const { data: scanRows, error: selErr } = await supabase
    .from("batch_contacts")
    .select("id, contact_id, phone, name, email, notes")
    .eq("batch_id", batch_id)
    .order("created_at", { ascending: true })
    .limit(2000)

  if (selErr) {
    // Mark session failed
    await supabase
      .from("call_scheduling_sessions")
      .update({ status: "failed", totals: { enqueued: 0, skipped: 0, errored: 1, reason: selErr.message } })
      .eq("id", session_id)
      .eq("owner_id", owner_id)

    return NextResponse.json({ success: false, error: selErr.message }, { status: 500 })
  }

  const contacts = (scanRows || []).filter((r: any) => !queuedSet.has(r.contact_id)).slice(0, limit)
  let enqueued = 0
  let skipped = 0
  let errored = 0

  for (let i = 0; i < contacts.length; i++) {
    const r = contacts[i]
    const target = (r as any)?.phone?.toString?.().trim?.() || null
    const payload = {
      source: "scheduling_ui",
      batch_id,
      session_id,
      contact_snapshot: {
        contact_id: r.contact_id,
        name: (r as any)?.name ?? null,
        email: (r as any)?.email ?? null,
        phone: target,
        notes: (r as any)?.notes ?? null,
      },
    }

    try {
      // Insert into transport queue (send to backend system)
      const { error: qErr } = await supabase
        .from("call_scheduling_queue")
        .insert([{
          session_id,
          owner_id,
          batch_id,
          contact_id: r.contact_id,
          target_phone: target,
          payload,
        }])

      const flaggedInvalid = !(target && CC_PLUS_9_REGEX.test(target))

      if (qErr) {
        errored += 1
        await supabase
          .from("call_scheduling_logs")
          .insert([{
            session_id,
            owner_id,
            contact_id: r.contact_id,
            action: "failed",
            detail: { error: qErr.message, phone: target, name: (r as any)?.name ?? null, flaggedInvalid },
          }])
      } else {
        enqueued += 1
        await supabase
          .from("call_scheduling_logs")
          .insert([{
            session_id,
            owner_id,
            contact_id: r.contact_id,
            action: "enqueued",
            detail: { phone: target, name: (r as any)?.name ?? null, flaggedInvalid },
          }])
      }
    } catch (e: any) {
      errored += 1
      await supabase
        .from("call_scheduling_logs")
        .insert([{
          session_id,
          owner_id,
          contact_id: r.contact_id,
          action: "failed",
          detail: { error: String(e), phone: (r as any)?.phone ?? null, name: (r as any)?.name ?? null },
        }])
    }

    // 3-second gap between each enqueue
    await sleep(3000)
  }

  // Update session status and totals
  await supabase
    .from("call_scheduling_sessions")
    .update({
      status: "completed",
      totals: { enqueued, skipped, errored },
    })
    .eq("id", session_id)
    .eq("owner_id", owner_id)

  return NextResponse.json({
    success: true,
    session_id,
    totals: { enqueued, skipped, errored },
    note: "Rows expire automatically in 24h",
  })
}