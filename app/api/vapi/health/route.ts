import { NextResponse } from "next/server"
import { VapiClient } from "@/lib/api/vapi"

export async function GET() {
  try {
    const hasKey = !!process.env.VAPI_API_KEY
    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID || null
    const baseUrl = process.env.VAPI_BASE_URL || 'https://api.vapi.ai'

    // If key missing, return early with diagnostics
    if (!hasKey) {
      return NextResponse.json({
        success: false,
        error: "VAPI_API_KEY is not set in environment",
        diagnostics: { hasKey, phoneNumberId, baseUrl }
      }, { status: 500 })
    }

    const vapi = new VapiClient()
    // Make a very small call to validate connectivity
    const calls = await vapi.listCalls({ limit: 1 })

    return NextResponse.json({
      success: true,
      message: "Vapi connectivity OK",
      diagnostics: {
        hasKey,
        phoneNumberId,
        baseUrl,
        sampleCount: Array.isArray(calls) ? calls.length : 0
      }
    })
  } catch (e: any) {
    let errorMessage = e?.message || 'Unknown error'
    if (/ENOTFOUND|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT|timeout/i.test(errorMessage)) {
      errorMessage = 'Network connectivity/timeout to Vapi API from serverless environment'
    } else if (/VAPI_API_KEY is not set/i.test(errorMessage)) {
      errorMessage = 'VAPI_API_KEY is not set in environment'
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 502 })
  }
}
