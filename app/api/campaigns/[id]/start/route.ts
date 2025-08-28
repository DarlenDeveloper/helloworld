import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { webhook_url } = await req.json()
  const campaignId = params.id

  if (!webhook_url || typeof webhook_url !== "string") {
    return NextResponse.json({ error: "webhook_url is required" }, { status: 400 })
  }

  const { error: upErr } = await supabase
    .from("campaigns")
    .update({ webhook_url, status: "active" })
    .eq("id", campaignId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })

  const { error: rpcErr } = await supabase.rpc("populate_campaign_contacts", { p_campaign: campaignId })
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
