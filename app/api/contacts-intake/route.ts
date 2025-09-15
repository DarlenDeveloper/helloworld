import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

type IntakePayload = {
  name?: string | null
  phone?: string | null
  email?: string | null
  country?: string | null
  message?: string | null
}

function sanitizeStr(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  return s.length ? s : null
}

function isValidEmail(email: string) {
  return /^\S+@\S+\.[\w-]+$/.test(email)
}

function isValidPhone(phone: string) {
  // Light validation; campaign importers also do lightweight checks
  const p = phone.replace(/\s+/g, "")
  return /^\+?[0-9]{8,}$/.test(p)
}

function csvEscape(value: string | null | undefined): string {
  const v = (value ?? "").toString()
  if (/[,"\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}

async function requireUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { supabase, user: null as any, error: error || new Error("Unauthorized") }
  }
  return { supabase, user, error: null as any }
}

export async function POST(request: Request) {
  try {
    const { supabase, user, error } = await requireUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = (await request.json()) as IntakePayload
    const payload: IntakePayload = {
      name: sanitizeStr(body.name),
      phone: sanitizeStr(body.phone),
      email: sanitizeStr(body.email),
      country: sanitizeStr(body.country),
      message: sanitizeStr(body.message),
    }

    // Require at least one of email or phone
    if (!payload.email && !payload.phone) {
      return NextResponse.json({ error: "Provide at least email or phone" }, { status: 400 })
    }
    if (payload.email && !isValidEmail(payload.email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 })
    }
    if (payload.phone && !isValidPhone(payload.phone)) {
      return NextResponse.json({ error: "Invalid phone" }, { status: 400 })
    }

    const { error: insErr } = await supabase
      .from("contacts_intake")
      .insert({
        user_id: user.id,
        name: payload.name,
        phone: payload.phone,
        email: payload.email,
        country: payload.country,
        message: payload.message,
      })

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const { supabase, user, error } = await requireUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const type = (searchParams.get("type") || "email").toLowerCase() as "email" | "contact"
    const filename = type === "email" ? "email_contacts.csv" : "phone_contacts.csv"

    // Fetch intake rows visible by RLS (owner or accepted collaborator)
    const { data, error: selErr } = await supabase
      .from("contacts_intake")
      .select("name, phone, email, country, message, created_at")
      .order("created_at", { ascending: false })

    if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 })

    let rows: string[][] = []

    if (type === "email") {
      // Headers aligned with email scheduler importer (email,name)
      rows.push(["email", "name"])
      for (const r of data || []) {
        if (!r.email) continue
        rows.push([r.email, r.name ?? ""])
      }
    } else {
      // contact/whatsapp importer expects first column with phone/contact/number, we use "phone"
      rows.push(["phone", "notes"])
      for (const r of data || []) {
        if (!r.phone) continue
        const notes = [r.name, r.country, r.message].filter(Boolean).join(" | ")
        rows.push([r.phone, notes])
      }
    }

    // Build CSV text
    const csv = rows.map((cols) => cols.map((c) => csvEscape(c)).join(",")).join("\r\n")

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}