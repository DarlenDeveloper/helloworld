import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { VapiClient, VapiAnalyticsRequest } from "@/lib/api/vapi"

export async function POST(req: Request) {
  const supabase = await createClient()

  // Resolve owner for RLS
  let owner_id: string | null = null
  try {
    const { data } = await (supabase as any).auth.getUser?.()
    owner_id = data?.user?.id || null
  } catch {}
  if (!owner_id) {
    return NextResponse.json({ success: false, error: "No authenticated user for RLS" }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const analyticsRequest = body as VapiAnalyticsRequest

    if (!analyticsRequest.queries || !Array.isArray(analyticsRequest.queries)) {
      return NextResponse.json({ success: false, error: "queries array is required" }, { status: 400 })
    }

    const vapi = new VapiClient()
    const result = await vapi.getAnalytics(analyticsRequest)

    return NextResponse.json({ success: true, data: result })
  } catch (e: any) {
    console.error("Vapi analytics error:", e)
    return NextResponse.json({ 
      success: false, 
      error: e?.message || "Failed to fetch analytics data" 
    }, { status: 502 })
  }
}
