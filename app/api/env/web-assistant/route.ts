export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from "next/server"

export async function GET() {
  try {
    const webAssistantId = process.env.VAPI_WEB_ASSISTANT_ID

    if (!webAssistantId) {
      return NextResponse.json({
        success: false,
        configured: false,
        message: "No web assistant added"
      })
    }

    return NextResponse.json({
      success: true,
      configured: true,
      assistantId: webAssistantId
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      configured: false,
      error: error?.message || "Failed to check web assistant configuration"
    }, { status: 500 })
  }
}
