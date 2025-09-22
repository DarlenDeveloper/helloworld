import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user }, error: uerr } = await supabase.auth.getUser()
  if (uerr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // With simple auth additions, acceptance is implicit once owner adds membership.
  // For backward compatibility, treat this as success if a matching account_users row exists.
  const { data, error } = await supabase
    .from("account_users")
    .select("id")
    .eq("member_user_id", user.id)
    .limit(1)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const hasMembership = (data || []).length > 0
  return NextResponse.json({ success: hasMembership })
}
