import { NextResponse } from "next/server"
import { VapiClient } from "@/lib/api/vapi"

export async function GET(req: Request) {
  console.log('Vapi calls endpoint called')

  try {
    const { searchParams } = new URL(req.url)
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0
    
    // Use VapiClient which is already working
    const vapi = new VapiClient()
    
    // Simple call without date filtering - just get all calls
    const calls = await vapi.listCalls({
      limit: 50
    })
    
    console.log(`Vapi API returned ${calls?.length || 0} calls`)
    
    // Handle pagination by slicing the results
    const paginatedCalls = calls?.slice(offset, offset + 50) || []
    
    return NextResponse.json({ 
      success: true, 
      data: paginatedCalls,
      hasMore: calls?.length > (offset + 50) // If there are more calls beyond current page
    })
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
