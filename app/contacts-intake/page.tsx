"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type IntakeRow = {
  name: string | null
  phone: string | null
  email: string | null
  country: string | null
  message: string | null
  created_at: string
}

export default function ContactsIntakeListPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<IntakeRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) throw error
        if (!user) {
          // Rely on middleware; do not client-redirect to avoid loops
          setLoading(false)
          return
        }

        // Show existing data from contact_form_submissions for the current user
        const { data, error: selErr } = await supabase
          .from("contact_form_submissions")
          .select("name, phone, email, country, message, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })

        if (selErr) {
          setError(selErr.message)
          setRows([])
        } else {
          setRows((data as IntakeRow[]) || [])
        }
      } catch (e: any) {
        setError(String(e?.message || e))
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [supabase, router])

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-black">Contact Form Submissions</CardTitle>
              <p className="text-gray-600 text-sm mt-1">Showing existing submissions (Name, Phone, Email Address, Country, Your Message)</p>
            </div>
            <div className="flex gap-2">
              <a href="/api/contact-form?type=email">
                <Button variant="outline" className="border-gray-300 bg-transparent">
                  Download Email CSV
                </Button>
              </a>
              <a href="/api/contact-form?type=contact">
                <Button variant="outline" className="border-gray-300 bg-transparent">
                  Download Contact CSV
                </Button>
              </a>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-gray-600">Loading...</div>
            ) : error ? (
              <div className="text-red-600">Error: {error}</div>
            ) : rows.length === 0 ? (
              <div className="text-gray-600">No submissions found.</div>
            ) : (
              <div className="w-full overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-black">Name</TableHead>
                      <TableHead className="text-black">Phone</TableHead>
                      <TableHead className="text-black">Email Address</TableHead>
                      <TableHead className="text-black">Country</TableHead>
                      <TableHead className="text-black">Your Message</TableHead>
                      <TableHead className="text-black">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="max-w-[200px] truncate">{r.name || ""}</TableCell>
                        <TableCell className="max-w-[160px] truncate">{r.phone || ""}</TableCell>
                        <TableCell className="max-w-[240px] truncate">{r.email || ""}</TableCell>
                        <TableCell className="max-w-[160px] truncate">{r.country || ""}</TableCell>
                        <TableCell className="max-w-[400px] truncate">{r.message || ""}</TableCell>
                        <TableCell className="whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="text-xs text-gray-500 mt-3">
              CSV formats: Email CSV → email,name. Contact CSV → phone,notes (notes = name | country | message).
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}