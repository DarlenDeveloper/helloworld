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

  if (inv.owner_user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (inv.status !== 'pending') return NextResponse.json({ error: "Only pending invitations can be revoked" }, { status: 400 })

  const { error: uerr2 } = await supabase
    .from("user_collaboration_invitations")
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq("id", inv.id)
  if (uerr2) return NextResponse.json({ error: uerr2.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
