import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function sanitizeIp(token: string): string | null {
  const t = token.trim()
  if (!t) return null
  // Remove quotes
  let v = t.replace(/^"+|"+$/g, "")
  // Remove port if IPv4 with port (e.g., 127.0.0.1:1234)
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v)) {
    v = v.split(":")[0]
  }
  // Basic IPv4 and IPv6 patterns
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
  const ipv6 = /^[a-fA-F0-9:]+$/
  if (ipv4.test(v) || ipv6.test(v)) return v
  return null
}

function getClientIp(req: Request): string | null {
  const headers = req.headers
  const headerOrder = [
    "x-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip",
    "fastly-client-ip",
    "fly-client-ip",
    "true-client-ip",
    "x-client-ip",
    "x-forwarded",
    "forwarded-for",
    "forwarded",
    "x-vercel-forwarded-for",
    "x-remote-addr",
    "remote-addr",
  ]
  for (const name of headerOrder) {
    const raw = headers.get(name)
    if (!raw) continue
    // x-forwarded-for can be a comma-separated list; left-most is original client
    const parts = raw.split(",")
    for (const p of parts) {
      const ip = sanitizeIp(p)
      if (ip) return ip
    }
  }
  return null
}

function parseDeviceName(ua: string | null): string | null {
  if (!ua) return null
  const uaLower = ua.toLowerCase()

  let os = "Unknown OS"
  if (uaLower.includes("iphone")) os = "iPhone iOS"
  else if (uaLower.includes("ipad")) os = "iPadOS"
  else if (uaLower.includes("android")) os = "Android"
  else if (uaLower.includes("windows")) os = "Windows"
  else if (uaLower.includes("mac os x") || uaLower.includes("macintosh")) os = "macOS"
  else if (uaLower.includes("linux")) os = "Linux"
  else if (uaLower.includes("cros")) os = "ChromeOS"

  let browser = "Browser"
  if (uaLower.includes("edg/") || uaLower.includes("edga") || uaLower.includes("edge")) browser = "Edge"
  else if (uaLower.includes("opr/") || uaLower.includes("opera")) browser = "Opera"
  else if (uaLower.includes("firefox/")) browser = "Firefox"
  else if (uaLower.includes("chrome/")) {
    // Ensure not misclassifying Edge/Opera as Chrome
    if (!uaLower.includes("edg/") && !uaLower.includes("opr/")) {
      browser = "Chrome"
    }
  } else if (uaLower.includes("safari/")) {
    browser = "Safari"
  }

  const isMobile = /mobile|iphone|ipod|android/.test(uaLower)
  const device = `${browser} on ${os}${isMobile ? " (Mobile)" : ""}`
  return device
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()

    if (userErr) {
      return NextResponse.json({ ok: false, error: String(userErr.message || userErr) }, { status: 500 })
    }
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const ua = req.headers.get("user-agent")
    const device = parseDeviceName(ua)
    const ip = getClientIp(req)

    await supabase.from("user_login_logs").insert({
      user_id: user.id,
      email: user.email || null,
      status: "success",
      ip_address: ip,
      user_agent: ua,
      device,
    })

    return NextResponse.json({ ok: true, ip, device })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}