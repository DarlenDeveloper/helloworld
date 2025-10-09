export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from "next/server"

export async function GET(req: Request) {
  console.log('Vapi chats endpoint called')

  try {
    const { searchParams } = new URL(req.url)
    const assistantId = searchParams.get('assistantId')

    const apiKey = process.env.VAPI_API_KEY

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: "VAPI_API_KEY is not set in environment variables"
      }, { status: 500 })
    }

    if (!assistantId) {
      return NextResponse.json({
        success: false,
        error: "assistantId parameter is required"
      }, { status: 400 })
    }

    const response = await fetch(`https://api.vapi.ai/chat?assistantId=${assistantId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Vapi API Error:', response.status, errorText)
      throw new Error(`Vapi API Error: ${response.status} - ${errorText}`)
    }

    const chatResponse = await response.json()
    const chats = chatResponse.results || []
    console.log(`Vapi API returned ${chats.length} chats`)

    return NextResponse.json({ 
      success: true, 
      data: chats,
      metadata: chatResponse.metadata 
    })
  } catch (e: any) {
    console.error("Vapi chats error:", e)
    
    let errorMessage = e?.message || "Failed to fetch chats data"
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
