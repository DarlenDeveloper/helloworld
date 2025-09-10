import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Create invitation, list invitations for current owner
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: uerr } = await supabase.auth.getUser()
  if (uerr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("user_collaboration_invitations")
    .select("*")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ invitations: data || [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: uerr } = await supabase.auth.getUser()
  if (uerr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const invitee_email = String(body?.invitee_email || "").trim().toLowerCase()
  const inputRole = String(body?.role || "").toLowerCase()
  const role = (inputRole === "major" || inputRole === "editor") ? "editor" : "viewer" // mini/viewer => viewer; major/editor => editor
  const daysValid = Math.min(30, Math.max(1, Number(body?.days_valid || 7)))
  const expires_at = new Date(Date.now() + daysValid * 24 * 3600 * 1000).toISOString()

  if (!invitee_email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(invitee_email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("user_collaboration_invitations")
    .insert({ owner_user_id: user.id, invitee_email, role, expires_at })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ invitation: data })
}
