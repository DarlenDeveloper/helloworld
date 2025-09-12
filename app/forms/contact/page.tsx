"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

type FormState = {
  name: string
  phone: string
  email: string
  country: string
  message: string
}

export default function ContactFormPage() {
  const supabase = createClient()
  const router = useRouter()
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({
    name: "",
    phone: "",
    email: "",
    country: "",
    message: "",
  })

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) throw error
        if (!user) {
          router.push("/auth")
          return
        }
      } catch (e) {
        console.error("Auth check failed:", e)
        router.push("/auth")
        return
      } finally {
        setCheckingAuth(false)
      }
    }
    init()
  }, [supabase, router])

  const isValidEmail = (email: string) => /^\S+@\S+\.[\w-]+$/.test(email)
  const isValidPhone = (phone: string) => /^\+?[0-9]{8,}$/.test(phone.replace(/\s+/g, ""))

  const onChange = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSuccessMsg(null)
    setErrorMsg(null)

    const name = form.name.trim()
    const phone = form.phone.trim()
    const email = form.email.trim()
    const country = form.country.trim()
    const message = form.message.trim()

    if (!email && !phone) {
      setErrorMsg("Provide at least Email or Phone.")
      return
    }
    if (email && !isValidEmail(email)) {
      setErrorMsg("Enter a valid email address.")
      return
    }
    if (phone && !isValidPhone(phone)) {
      setErrorMsg("Enter a valid phone number (start with + and at least 8 digits).")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/contacts-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, country, message }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(j.error || `Failed to submit (${res.status})`)
      }
      setSuccessMsg("Submission received. You can download CSVs below.")
      setForm({ name: "", phone: "", email: "", country: "", message: "" })
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to submit form.")
    } finally {
      setSubmitting(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="p-8">
        <div className="max-w-3xl mx-auto text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-black">Contact Intake Form</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" placeholder="Your name" value={form.name} onChange={onChange("name")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" placeholder="e.g., Uganda" value={form.country} onChange={onChange("country")} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" placeholder="e.g., +256778825312" value={form.phone} onChange={onChange("phone")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" placeholder="e.g., johndoe@example.com" value={form.email} onChange={onChange("email")} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Your Message</Label>
                <Textarea id="message" rows={4} placeholder="Type your message..." value={form.message} onChange={onChange("message")} />
              </div>

              <div className="text-sm text-gray-600">
                Provide at least one of Email or Phone. You can export in CSV formats suitable for your Email and WhatsApp campaign pages.
              </div>

              {errorMsg && (
                <div className="rounded-md border border-red-200 bg-red-50 text-red-700 p-3">{errorMsg}</div>
              )}
              {successMsg && (
                <div className="rounded-md border border-green-200 bg-green-50 text-green-700 p-3">{successMsg}</div>
              )}

              <div className="flex items-center gap-3">
                <Button type="submit" className="bg-teal-500 hover:bg-teal-600" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit"}
                </Button>

                {/* CSV exports */}
                <a
                  href="/api/contacts-intake?type=email"
                  className="px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
                >
                  Download Email CSV
                </a>
                <a
                  href="/api/contacts-intake?type=contact"
                  className="px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
                >
                  Download Contact CSV
                </a>
              </div>

              <div className="text-xs text-gray-500 mt-2">
                Email CSV columns: email,name. Contact CSV columns: phone,notes.
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}