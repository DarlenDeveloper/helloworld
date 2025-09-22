import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// List collaborators for current owner
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: uerr } = await supabase.auth.getUser()
  if (uerr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Source of truth is account_users (owner -> member). Map to legacy collaborator shape.
  const { data, error } = await supabase
    .from("account_users")
    .select("id, owner_user_id, member_user_id, role, is_active, created_at")
    .eq("owner_user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const collaborators = (data || []).map((row: any) => ({
    id: row.id,
    owner_user_id: row.owner_user_id,
    collaborator_user_id: row.member_user_id,
    role: String(row.role || "user").toLowerCase() === "admin" ? "editor" : "viewer",
    created_at: row.created_at,
  }))
  return NextResponse.json({ collaborators })
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
      .from("account_users")
      .delete()
      .eq("owner_user_id", user.id)
      .eq("member_user_id", collaborator_user_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  const inputRole = String(body?.role || "").toLowerCase()
  const mappedRole = (inputRole === "major" || inputRole === "editor") ? "admin" : "user"
  const { error } = await supabase
    .from("account_users")
    .update({ role: mappedRole })
    .eq("owner_user_id", user.id)
    .eq("member_user_id", collaborator_user_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
