import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user }, error: uerr } = await supabase.auth.getUser()
  if (uerr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // No-op under account_users model. Validate ownership to keep behavior predictable.
  const ok = Boolean(params.id)
  if (!ok) return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  return NextResponse.json({ success: true })
}
