import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { error } = await supabase.from("campaigns").update({ status: "completed" }).eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
