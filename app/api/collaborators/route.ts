import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// List collaborators for current owner
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: uerr } = await supabase.auth.getUser()
  if (uerr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("user_collaborators")
    .select("*")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ collaborators: data || [] })
}

// Update collaborator role or remove collaborator
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: uerr } = await supabase.auth.getUser()
  if (uerr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const collaborator_user_id = String(body?.collaborator_user_id || "")
  const action = String(body?.action || "").toLowerCase() // 'update' | 'remove'
  if (!collaborator_user_id) return NextResponse.json({ error: "collaborator_user_id required" }, { status: 400 })

  if (action === 'remove') {
    const { error } = await supabase
      .from("user_collaborators")
      .delete()
      .eq("owner_user_id", user.id)
      .eq("collaborator_user_id", collaborator_user_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  const inputRole = String(body?.role || "").toLowerCase()
  const role = (inputRole === "major" || inputRole === "editor") ? "editor" : "viewer"
  const { error } = await supabase
    .from("user_collaborators")
    .update({ role })
    .eq("owner_user_id", user.id)
    .eq("collaborator_user_id", collaborator_user_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
