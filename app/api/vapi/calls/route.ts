import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { VapiClient } from "@/lib/api/vapi"

export async function GET(req: Request) {
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
    // Check if Vapi API key is configured
    if (!process.env.VAPI_API_KEY) {
      return NextResponse.json({ 
        success: false, 
        error: "VAPI_API_KEY is not configured in environment variables" 
      }, { status: 500 })
    }

    const { searchParams } = new URL(req.url)
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50
    const createdAtGte = searchParams.get('createdAtGte')
    const createdAtLte = searchParams.get('createdAtLte')

    console.log('Vapi API call params:', {
      limit,
      createdAtGte,
      createdAtLte,
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      baseUrl: process.env.VAPI_BASE_URL || 'https://api.vapi.ai'
    })

    const vapi = new VapiClient()
    const calls = await vapi.listCalls({
      limit,
      createdAtGte: createdAtGte || undefined,
      createdAtLte: createdAtLte || undefined
    })

    console.log(`Vapi API returned ${calls?.length || 0} calls`)
    return NextResponse.json({ success: true, data: calls || [] })
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
