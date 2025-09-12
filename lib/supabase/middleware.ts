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

  // Always verify via Supabase (do not assume cookie names exist).
  // Some environments/browsers may store tokens under different names.

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

  // Allow authenticated users to remain on auth routes (avoid redirect loops).
  // The app/pages can handle post-login navigation.
  if (user && isAuthRoute) {
    return supabaseResponse
  }

  return supabaseResponse
}
