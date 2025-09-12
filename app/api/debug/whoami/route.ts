import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie") || ""
    const cookieCount = cookieHeader ? cookieHeader.split(";").length : 0

    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    return NextResponse.json({
      ok: true,
      serverUser: user ? { id: user.id, email: user.email } : null,
      supabaseError: error ? String(error.message || error) : null,
      cookieHeaderPresent: Boolean(cookieHeader),
      cookieCount,
      envPresent: {
        url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        anonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      },
      note: "If serverUser is null after successful login, cookies/env are not wired. Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY and restart dev server.",
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}