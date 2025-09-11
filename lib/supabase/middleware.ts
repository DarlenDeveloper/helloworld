import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const path = request.nextUrl.pathname
  const isAuthRoute = path.startsWith("/auth") || path.startsWith("/login") || path.startsWith("/sign-up")
  const isApiRoute = path.startsWith("/api")

  // Skip auth check for API routes and static assets - they handle auth separately
  if (isApiRoute) {
    return supabaseResponse
  }

  // Check if we have auth tokens in cookies first (faster than API call)
  const accessToken = request.cookies.get("sb-access-token")
  const refreshToken = request.cookies.get("sb-refresh-token")
  
  // If no tokens at all, redirect to auth immediately
  if (!accessToken && !refreshToken && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth"
    return NextResponse.redirect(url)
  }

  // If we have tokens or are on auth route, create client and verify
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth"
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
