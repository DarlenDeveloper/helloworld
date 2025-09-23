export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server"
import { VapiClient } from "@/lib/api/vapi"

export async function GET(req: Request) {
  console.log('Vapi calls endpoint called')

  try {
    // Even if caller provides offset, we ignore it when querying Vapi.
    // We fetch all calls with the exact API shape (no offset) and paginate on the client.
    const { searchParams } = new URL(req.url)
    void searchParams // not used

    // Use VapiClient which is already working
    const vapi = new VapiClient()

    // Exact call: no date filters, no offset. phoneNumberId is injected by VapiClient from env.
    const calls = await vapi.listCalls()

    console.log(`Vapi API returned ${calls?.length || 0} calls`)

    return NextResponse.json({ success: true, data: calls || [], hasMore: false })
  } catch (e: any) {
    console.error("Vapi calls error:", e)
    
    // Provide more specific error messages
    let errorMessage = e?.message || "Failed to fetch calls data"
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      errorMessage = "Invalid Vapi API key. Please check your VAPI_API_KEY environment variable."
    } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
      errorMessage = "Access denied. Please check your Vapi API permissions."
    } else if (errorMessage.includes('404')) {
      errorMessage = "Vapi API endpoint not found. Please check your VAPI_BASE_URL."
    }
    
    return NextResponse.json({ 
      success: false, 
      error: errorMessage
    }, { status: 502 })
  }
}
