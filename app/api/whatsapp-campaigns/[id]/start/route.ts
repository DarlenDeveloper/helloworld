import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const campaignId = params.id

  let webhook_url: unknown = undefined
  try {
    const body = await req.json()
    webhook_url = body?.webhook_url
  } catch {
    // optional body
  }

  const update: any = { status: "active" }
  if (typeof webhook_url === "string" && webhook_url.trim().length > 0) {
    update.webhook_url = webhook_url.trim()
  }

  const { error: upErr } = await supabase
    .from("whatsapp_campaigns")
    .update(update)
    .eq("id", campaignId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })

  const { error: rpcErr } = await supabase.rpc("populate_whatsapp_campaign_contacts", { p_campaign: campaignId })
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
