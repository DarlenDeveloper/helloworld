import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user }, error: uerr } = await supabase.auth.getUser()
  if (uerr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: inv, error: ierr } = await supabase
    .from("user_collaboration_invitations")
    .select("*")
    .eq("id", params.id)
    .single()
  if (ierr || !inv) return NextResponse.json({ error: "Invitation not found" }, { status: 404 })

  const now = new Date()
  if (inv.status !== 'pending') return NextResponse.json({ error: "Invitation not pending" }, { status: 400 })
  if (inv.expires_at && new Date(inv.expires_at) < now) return NextResponse.json({ error: "Invitation expired" }, { status: 400 })

  // Only the invitee (matching email) can accept
  const email = (user.email || '').toLowerCase()
  if (!email || email !== (inv.invitee_email || '').toLowerCase()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // 1) Create collaborator row
  const { error: cerr } = await supabase
    .from("user_collaborators")
    .insert({ owner_user_id: inv.owner_user_id, collaborator_user_id: user.id, role: inv.role })
  if (cerr && !/duplicate key/i.test(cerr.message)) {
    return NextResponse.json({ error: cerr.message }, { status: 400 })
  }

  // 2) Mark invitation accepted
  const { error: uerr2 } = await supabase
    .from("user_collaboration_invitations")
    .update({ status: 'accepted', accepted_by_user_id: user.id, updated_at: new Date().toISOString() })
    .eq("id", inv.id)
  if (uerr2) return NextResponse.json({ error: uerr2.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
