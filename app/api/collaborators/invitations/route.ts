import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Create invitation, list invitations for current owner
export async function GET() {
  // We no longer track invitations; return empty list to keep UI stable
  const supabase = await createClient()
  const { data: { user }, error: uerr } = await supabase.auth.getUser()
  if (uerr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ invitations: [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: uerr } = await supabase.auth.getUser()
  if (uerr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const invitee_email = String(body?.invitee_email || "").trim().toLowerCase()
  const inputRole = String(body?.role || "").toLowerCase()
  const mappedRole = (inputRole === "major" || inputRole === "editor") ? "admin" : "user"

  if (!invitee_email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(invitee_email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 })
  }

  // Use admin client to find or create auth user by email
  const admin = createAdminClient()

  // 1) Try to find existing user by email
  const { data: usersByEmail, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  }) as any
  if (listErr) return NextResponse.json({ error: String(listErr.message || listErr) }, { status: 400 })
  const existing = (usersByEmail?.users || []).find((u: any) => String(u.email || "").toLowerCase() === invitee_email)

  let memberUserId: string | null = null
  if (existing) {
    memberUserId = existing.id
  } else {
    // Create the user without sending an email (simple-auth addition)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: invitee_email,
      email_confirm: true,
    }) as any
    if (createErr) return NextResponse.json({ error: String(createErr.message || createErr) }, { status: 400 })
    memberUserId = created?.user?.id || null
  }

  if (!memberUserId) return NextResponse.json({ error: "Failed to resolve member user id" }, { status: 400 })

  // 2) Insert membership row; RLS allows owner to insert into account_users
  const { error: insErr } = await supabase
    .from("account_users")
    .insert({ owner_user_id: user.id, member_user_id: memberUserId, role: mappedRole, is_active: true })
  if (insErr && !/duplicate key/i.test(insErr.message)) {
    return NextResponse.json({ error: insErr.message }, { status: 400 })
  }

  // Keep the response shape similar to previous invitation creation
  return NextResponse.json({ invitation: { id: memberUserId, invitee_email, role: mappedRole === 'admin' ? 'editor' : 'viewer', status: 'accepted', created_at: new Date().toISOString() } })
}
