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

    const apiKey = process.env.VAPI_API_KEY
    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID
    const assistantId = process.env.VAPI_ASSISTANT_ID || "1cdadc27-e2be-4b54-b7a9-bb87f6ad14d3"
    const companyName = process.env.COMPANY_NAME || "Skynet"
    const callerName = process.env.CALLER_NAME || "Brian"
    const companyFilesId = process.env.COMPANY_FILES_ID // Optional knowledge base file ID

    if (!apiKey || !phoneNumberId) {
      return NextResponse.json({
        success: false,
        error: "Missing VAPI_API_KEY or VAPI_PHONE_NUMBER_ID in environment variables"
      }, { status: 500 })
    }

    console.log('Creating call for:', customerName, customerPhone)

    // Create comprehensive system prompt for two-step conversation
    const systemPrompt = `You are ${callerName} from ${companyName}. You are making an outbound call to ${customerName}.

CRITICAL CONVERSATION FLOW:
1. FIRST: Always start with identity confirmation: "Hi, this is ${callerName} from ${companyName}. Am I speaking to ${customerName}?"

2. WAIT for their response to confirm identity:
   - If they confirm (Yes/Speaking/This is [name]/etc.) → Proceed to step 3
   - If they say wrong person → Politely ask for ${customerName} or end call
   - If unclear → Ask again for confirmation

3. ONLY AFTER CONFIRMATION: Deliver your message: "${script}"

IMPORTANT RULES:
- Never deliver the main message until you confirm you're speaking to ${customerName}
- Be professional, friendly, and respectful
- If they're not available, offer to call back or leave a brief message
- Keep the conversation focused and concise
- If they have questions, answer them helpfully
${companyFilesId ? `- You have access to company knowledge base (File ID: ${companyFilesId}) for detailed questions` : ''}

COMPANY INFO:
- Company: ${companyName}
- Your name: ${callerName}
- Customer: ${customerName}
- Purpose: Professional outbound communication`

    // Create the call using Vapi API
    const callPayload: any = {
      name: `${reason} - ${customerName}`,
      assistantId: assistantId,
      phoneNumberId: phoneNumberId,
      customer: {
        number: customerPhone,
        name: customerName
      },
      assistantOverrides: {
        firstMessage: `Hi, this is ${callerName} from ${companyName}. Am I speaking to ${customerName}?`,
        systemPrompt: systemPrompt,
        variableValues: {
          customerName: customerName,
          callerName: callerName,
          companyName: companyName
        }
      }
    }

    // Add knowledge base file if provided
    if (companyFilesId) {
      callPayload.assistantOverrides.knowledgeBase = {
        fileIds: [companyFilesId]
      }
    }

    const response = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(callPayload)
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
