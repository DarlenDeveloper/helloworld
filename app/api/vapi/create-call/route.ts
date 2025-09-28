export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from "next/server"

export async function POST(req: Request) {
  console.log('Create single call endpoint called')

  try {
    const { customerName, customerPhone, script, reason } = await req.json()

    // Validate required fields
    if (!customerName || !customerPhone || !script) {
      return NextResponse.json({
        success: false,
        error: "Missing required fields: customerName, customerPhone, or script"
      }, { status: 400 })
    }

    // Get environment variables
    const apiKey = process.env.VAPI_API_KEY
    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID
    const assistantId = process.env.VAPI_ASSISTANT_ID || "1cdadc27-e2be-4b54-b7a9-bb87f6ad14d3"

    if (!apiKey || !phoneNumberId) {
      return NextResponse.json({
        success: false,
        error: "Missing VAPI_API_KEY or VAPI_PHONE_NUMBER_ID in environment variables"
      }, { status: 500 })
    }

    console.log('Creating call for:', customerName, customerPhone)

    // Create the call using Vapi API
    const response = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: `${reason} - ${customerName}`,
        assistantId: assistantId,
        phoneNumberId: phoneNumberId,
        customer: {
          number: customerPhone,
          name: customerName
        },
        assistantOverrides: {
          firstMessage: script,
          variableValues: {
            customerName: customerName
          }
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Vapi API Error:', response.status, errorText)
      throw new Error(`Vapi API Error: ${response.status} - ${errorText}`)
    }

    const callData = await response.json()
    console.log('Call created successfully:', callData.id)

    return NextResponse.json({
      success: true,
      data: callData,
      message: `Call created successfully for ${customerName}`
    })

  } catch (error: any) {
    console.error("Create call error:", error)
    
    let errorMessage = error?.message || "Failed to create call"
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      errorMessage = "Invalid Vapi API key. Please check your VAPI_API_KEY environment variable."
    } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
      errorMessage = "Access denied. Please check your Vapi API permissions."
    } else if (errorMessage.includes('400')) {
      errorMessage = "Invalid request data. Please check the customer phone number format."
    }

    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 })
  }
}
