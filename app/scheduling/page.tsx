"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, Plus, Edit, Trash2, Users, Play } from "lucide-react"
import { format } from "date-fns"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

 // Looser "acceptable" phone check for red-flagging only (not enforced).
 // Acceptable (but not enforced for dispatch): +countrycode followed by at least 9 digits (total 10+ digits).
 const CC_PLUS_9_REGEX = /^\+\d{10,}$/
 // How many logs to fetch per page (supports thousands via paging)
 const LOGS_PAGE_SIZE = 200

// Helpers
function pad2(n: number) { return n.toString().padStart(2, "0") }
function formatDateLocal(d: Date | null): string {
  if (!d) return ""
  const yr = d.getFullYear()
  const mo = pad2(d.getMonth() + 1)
  const da = pad2(d.getDate())
  return `${yr}-${mo}-${da}`
}

// Basic loose normalization: strip separators, 00->+, add + if only digits and length >= 10.
// We DO NOT enforce validity here; red flags are purely visual and nothing is suppressed.
function normalizeLoosePhone(raw: string): string {
  let s = (raw || "").trim()
  s = s.replace(/[\s\-().]/g, "")
  if (s.startsWith("00")) s = "+" + s.slice(2)
  if (!s.startsWith("+") && /^\d{10,}$/.test(s)) s = "+" + s
  return s
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Convert a local datetime string (assumed Africa/Kampala, UTC+3) to UTC ISO8601 Z string
function toUtcFromKampala(local: string): string | undefined {
  const s = (local || "").trim()
  if (!s) return undefined
  // If already includes timezone or Z, trust it and normalize to ISO
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s)
    if (isNaN(d.getTime())) return undefined
    return d.toISOString()
  }
  // Expect formats like YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return undefined
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  const hour = Number(m[4])
  const minute = Number(m[5])
  const second = Number(m[6] || "0")
  // Kampala is UTC+3, so UTC = local - 3 hours
  const d = new Date(Date.UTC(year, month, day, hour - 3, minute, second))
  return d.toISOString()
}

// Helpers to format and compute Africa/Kampala (UTC+3) local strings
function fmtYMDHM(y: number, m: number, d: number, hh: number, mm: number) {
  return `${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}`
}

function eatNowComponents() {
  const eatNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
  return {
    y: eatNow.getUTCFullYear(),
    m: eatNow.getUTCMonth() + 1,
    d: eatNow.getUTCDate(),
    hh: eatNow.getUTCHours(),
    mm: eatNow.getUTCMinutes(),
  }
}

export function presetNowWindow(): { earliest: string; latest: string } {
  const { y, m, d, hh, mm } = eatNowComponents()
  const earliest = fmtYMDHM(y, m, d, hh, mm)
  // +6 hours window by default
  const end = new Date(Date.UTC(y, m - 1, d, hh, mm))
  end.setUTCHours(end.getUTCHours() + 6)
  const latest = fmtYMDHM(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), end.getUTCHours(), end.getUTCMinutes())
  return { earliest, latest }
}

export function presetTodayBusiness(): { earliest: string; latest: string } {
  const { y, m, d } = eatNowComponents()
  return { earliest: fmtYMDHM(y, m, d, 9, 0), latest: fmtYMDHM(y, m, d, 21, 0) }
}

export function presetTomorrowBusiness(): { earliest: string; latest: string } {
  const { y, m, d } = eatNowComponents()
  const base = new Date(Date.UTC(y, m - 1, d, 0, 0))
  base.setUTCDate(base.getUTCDate() + 1)
  const yy = base.getUTCFullYear(), mm = base.getUTCMonth() + 1, dd = base.getUTCDate()
  return { earliest: fmtYMDHM(yy, mm, dd, 9, 0), latest: fmtYMDHM(yy, mm, dd, 21, 0) }
}

// Live count helper: prefer snapshot table over possibly stale counters.
async function countContactsForBatch(supabase: ReturnType<typeof createClient>, batchId: string): Promise<number> {
  // Use a tiny range with count: 'exact' so Supabase returns Content-Range count reliably.
  const { count, error } = await supabase
    .from("batch_contacts")
    .select("id", { count: "exact" })
    .eq("batch_id", batchId)
    .range(0, 0) // fetch no real data, just headers (count)
  if (error) {
    console.error("countContactsForBatch error:", error)
    return 0
  }
  return Number(count ?? 0)
}

interface DbContactBatch {
  id: string
  user_id: string
  name: string
  description: string | null
  contact_count: number
  created_at: string
  updated_at: string
}

interface DbContact {
  id: string
  user_id: string
  name: string | null
  email: string | null
  phone: string | null
  notes: string | null
}

type CallSession = {
  id: string
  status: "running" | "completed" | "failed"
  totals: { enqueued?: number; skipped?: number; errored?: number } | null
  created_at: string
}

type CallLog = {
  id: string
  session_id: string
  contact_id: string | null
  action: "enqueued" | "skipped" | "failed"
  detail: any
  created_at: string
}

export default function SchedulingPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const [contactBatches, setContactBatches] = useState<DbContactBatch[]>([])
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null)
  const [selectedBatchContacts, setSelectedBatchContacts] = useState<DbContact[]>([])

  // CSV import
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number } | null>(null)

  // Start Call Batch (transport sessions)
  const [starting, setStarting] = useState(false)
  const [lastSession, setLastSession] = useState<CallSession | null>(null)
  const [recentLogs, setRecentLogs] = useState<CallLog[]>([])
  const [callReady, setCallReady] = useState<boolean | null>(null)
  const [earliestAt, setEarliestAt] = useState<string>("")
  const [latestAt, setLatestAt] = useState<string>("")
  // Logs pagination state
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsHasMore, setLogsHasMore] = useState(false)
  const [logsCursor, setLogsCursor] = useState<string | null>(null) // created_at of last row in current list

  // Derived map for quick lookups
  const batchMap = useMemo(() => {
    const m = new Map<string, DbContactBatch>()
    contactBatches.forEach((b) => m.set(b.id, b))
    return m
  }, [contactBatches])

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) throw error
        if (!user) {
          router.push("/auth")
          return
        }
        setUser(user)
        await fetchBatches(user.id)
      } catch (e) {
        console.error("Failed to initialize scheduling page:", e)
      } finally {
        setLoading(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router])

  
  const fetchBatches = async (userId: string) => {
    const { data, error } = await supabase
      .from("contact_batches")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching contact batches:", error)
      return
    }

    // Overlay live counts per batch from snapshot table
    const rows = Array.isArray(data) ? data : []
    const withCounts: DbContactBatch[] = await Promise.all(
      rows.map(async (b: any) => {
        const live = await countContactsForBatch(supabase, b.id)
        // Prefer live count when available
        return { ...b, contact_count: live > 0 ? live : Number(b.contact_count ?? 0) } as DbContactBatch
      })
    )
    setContactBatches(withCounts)
  }

  const fetchBatchContacts = async (batchId: string) => {
    const { data, error } = await supabase
      .from("batch_contacts")
      .select("contact_id, name, email, phone, notes")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching batch_contacts:", error)
      setSelectedBatchContacts([])
      return
    }

    const mapped: DbContact[] = (data || []).map((r: any) => ({
      id: r.contact_id,
      user_id: user?.id || "",
      name: r.name,
      email: r.email,
      phone: r.phone,
      notes: r.notes,
    }))
    setSelectedBatchContacts(mapped)
  }

  const onClickImportCSV = () => fileInputRef.current?.click()

  type ParsedPhones = { rows: { phone: string; notes: string }[] }

  // Accept everything; sanitize lightly. No skipping, no validation here.
  const parseCSV = (text: string): ParsedPhones => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return { rows: [] }

    const hasHeader = /(^|,)\s*(contact|phone|number)\s*(,|$)/i.test(lines[0])
    const entries = hasHeader ? lines.slice(1) : lines

    const rows: { phone: string; notes: string }[] = []
    for (const line of entries) {
      const parts = line.split(",")
      const rawPhone = (parts[0] || "").trim()
      if (!rawPhone) continue
      const notes = (parts[1] || "").trim()
      rows.push({ phone: normalizeLoosePhone(rawPhone), notes })
    }
    return { rows }
  }

  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const res: T[][] = []
    for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size))
    return res
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !selectedBatch) return
    const file = e.target.files?.[0]
    e.target.value = "" // reset input value for future imports
    if (!file) return

    try {
      const text = await file.text()
      const parsed = parseCSV(text)
      const uniqueByPhone = Array.from(new Map(parsed.rows.map((r) => [r.phone, r])).values())
      if (uniqueByPhone.length === 0) {
        alert("No contacts found in CSV.")
        return
      }

      setImporting(true)
      setImportProgress({ processed: 0, total: uniqueByPhone.length })

      const CHUNK_SIZE = 500
      const chunks = chunk(uniqueByPhone, CHUNK_SIZE)
      let totalInserted = 0

      let allowedRemaining = Math.max(0, 1000 - (batchMap.get(selectedBatch)?.contact_count || 0))
      if (allowedRemaining === 0) {
        alert("This batch already has 1000 contacts.")
        return
      }

      for (let i = 0; i < chunks.length && allowedRemaining > 0; i++) {
        const c = chunks[i].slice(0, allowedRemaining)
        // Insert contacts (no phone enforcement)
        const contactRows = c.map((r) => ({
          user_id: user.id,
          name: null,
          email: null,
          phone: r.phone,
          notes: r.notes || null,
        }))

        const { data: inserted, error: insErr } = await supabase
          .from("contacts")
          .insert(contactRows)
          .select("id")

        if (insErr) {
          console.error("Failed inserting contacts chunk:", insErr)
          alert("Failed to import some contacts. See console for details.")
          break
        }

        const linkRows = (inserted || []).map((row: any, idx: number) => ({
          batch_id: selectedBatch,
          contact_id: row.id,
          name: null,
          email: null,
          phone: c[idx]?.phone || null,
          notes: c[idx]?.notes || null,
        }))

        if (linkRows.length > 0) {
          const { error: linkErr } = await supabase.from("batch_contacts").insert(linkRows)
          if (linkErr) {
            console.error("Failed linking batch contacts:", linkErr)
            alert("Failed to link some contacts to batch. See console for details.")
            break
          }
        }

        totalInserted += contactRows.length
        setImportProgress({ processed: Math.min(totalInserted, uniqueByPhone.length), total: uniqueByPhone.length })
        allowedRemaining -= contactRows.length
      }

      // Update batch contact_count in DB and in memory
      if (totalInserted > 0) {
        await supabase
          .from("contact_batches")
          .update({ contact_count: (batchMap.get(selectedBatch)?.contact_count || 0) + totalInserted })
          .eq("id", selectedBatch)

        // Refresh batch in memory with live recount to avoid drift
        await fetchBatches(user.id)
        await fetchBatchContacts(selectedBatch)
      }
    } catch (err) {
      console.error("Failed to import CSV:", err)
      alert("Failed to import CSV.")
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  const handleCreateBatch = async () => {
    if (!user) return
    const defaultName = `New Batch ${contactBatches.length + 1}`

    const { data, error } = await supabase
      .from("contact_batches")
      .insert({ user_id: user.id, name: defaultName, description: null })
      .select("*")
      .single()

    if (error) {
      console.error("Failed to create contact batch:", error)
      alert("Failed to create batch")
      return
    }

    setContactBatches((prev) => [data as DbContactBatch, ...prev])
  }

  const handleDeleteBatch = async (batchId: string) => {
    if (!user) return
    if (!confirm("Delete this batch?")) return

    const { error } = await supabase
      .from("contact_batches")
      .delete()
      .eq("id", batchId)
      .eq("user_id", user.id)

    if (error) {
      console.error("Failed to delete batch:", error)
      alert("Failed to delete batch")
      return
    }

    setContactBatches((prev) => prev.filter((b) => b.id !== batchId))
    if (selectedBatch === batchId) {
      setSelectedBatch(null)
      setSelectedBatchContacts([])
      setLastSession(null)
      setRecentLogs([])
    }
  }

  const handleRenameBatch = async (batchId: string, newName: string) => {
    if (!user) return
    const { data, error } = await supabase
      .from("contact_batches")
      .update({ name: newName })
      .eq("id", batchId)
      .eq("user_id", user.id)
      .select("*")
      .single()

    if (error) {
      console.error("Failed to rename batch:", error)
      alert("Failed to rename batch")
      return
    }

    setContactBatches((prev) => prev.map((b) => (b.id === batchId ? (data as DbContactBatch) : b)))
  }

  // Sessions and logs (24h transport)
  const fetchLatestSessionForBatch = async (batchId: string) => {
    const { data, error } = await supabase
      .from("call_scheduling_sessions")
      .select("id, status, totals, created_at")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: false })
      .limit(1)

    if (error) {
      console.error("Failed to fetch sessions:", error)
      return null
    }
    const sess = (data || [])[0] as CallSession | undefined
    setLastSession(sess || null)
    return sess || null
  }

  // Reset logs for a session and load the first page (LOGS_PAGE_SIZE)
  const fetchLogsResetForSession = async (sessionId: string) => {
    setLogsLoading(true)
    try {
      const { data, error } = await supabase
        .from("call_scheduling_logs")
        .select("id, session_id, contact_id, action, detail, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(LOGS_PAGE_SIZE)

      if (error) {
        console.error("Failed to fetch logs (reset):", error)
        setRecentLogs([])
        setLogsHasMore(false)
        setLogsCursor(null)
        return
      }
      const rows = (data || []) as CallLog[]
      setRecentLogs(rows)
      const last = rows[rows.length - 1]
      setLogsCursor(last ? last.created_at : null)
      setLogsHasMore(rows.length === LOGS_PAGE_SIZE)
    } finally {
      setLogsLoading(false)
    }
  }

  // Load next page using a descending created_at cursor
  const fetchLogsMoreForSession = async (sessionId: string) => {
    if (!logsHasMore || logsLoading) return
    setLogsLoading(true)
    try {
      const query = supabase
        .from("call_scheduling_logs")
        .select("id, session_id, contact_id, action, detail, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(LOGS_PAGE_SIZE)
      if (logsCursor) {
        ;(query as any).lt("created_at", logsCursor)
      }
      const { data, error } = await query
      if (error) {
        console.error("Failed to fetch logs (more):", error)
        setLogsHasMore(false)
        return
      }
      const rows = (data || []) as CallLog[]
      setRecentLogs((prev) => [...prev, ...rows])
      const last = rows[rows.length - 1]
      setLogsCursor(last ? last.created_at : null)
      setLogsHasMore(rows.length === LOGS_PAGE_SIZE)
    } finally {
      setLogsLoading(false)
    }
  }

  const refreshPanel = async () => {
    if (!selectedBatch) {
      setLastSession(null)
      setRecentLogs([])
      setLogsCursor(null)
      setLogsHasMore(false)
      return
    }
    const sess = await fetchLatestSessionForBatch(selectedBatch)
    if (sess) {
      await fetchLogsResetForSession(sess.id)
    } else {
      // No session yet for this batch — clear previous batch's logs
      setRecentLogs([])
      setLogsCursor(null)
      setLogsHasMore(false)
    }
  }

  const onStartCallBatch = async () => {
    if (!selectedBatch) {
      alert("Select a batch first")
      return
    }
    setStarting(true)
    try {
      const earliestUtc = toUtcFromKampala(earliestAt)
      const latestUtc = toUtcFromKampala(latestAt)
      if (earliestAt && !earliestUtc) throw new Error("Invalid 'Earliest At' format. Use YYYY-MM-DDTHH:mm (Kampala time).")
      if (latestAt && !latestUtc) throw new Error("Invalid 'Latest At' format. Use YYYY-MM-DDTHH:mm (Kampala time).")
      if (earliestUtc && latestUtc) {
        const e = new Date(earliestUtc).getTime(); const l = new Date(latestUtc).getTime(); if (e > l) throw new Error("Earliest time must be before Latest time.")
      }
      const plan = (earliestUtc || latestUtc) ? { earliestAt: earliestUtc, latestAt: latestUtc } : undefined
      const res = await fetch("/api/scheduling/call/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: selectedBatch, schedulePlan: plan }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || `Failed to start campaign (${res.status})`)
      const contacts = Number(j?.totals?.contacts ?? 0)
      const campaigns = Number(j?.totals?.campaigns ?? (Array.isArray(j?.campaigns) ? j.campaigns.length : 0))
      alert(`Created ${campaigns} campaign(s) for ${contacts} contact(s) via Airies AI.`)
    } catch (e: any) {
      alert(e?.message || "Failed to start campaign(s)")
    } finally {
      setStarting(false)
    }
  }

  // Start sessions repeatedly (10 contacts per session) until batch is exhausted.
  // Disabled when callReady === false to avoid duplicate sends in fallback mode.
  const onStartFullBatch = async () => {
    await onStartCallBatch()
  }

  useEffect(() => {
    if (selectedBatch) {
      fetchBatchContacts(selectedBatch)
      refreshPanel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatch])

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-gray-600">Loading scheduling...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-black">Call Scheduling</h1>
            <p className="text-gray-600 mt-2">
              Create outbound call campaigns. Choose your calling window in Kampala time; contacts are sent in campaigns of up to 500 automatically.
            </p>
          </div>
          <div className="flex gap-4">
            <Button variant="outline" className="border-gray-300 bg-transparent" onClick={handleCreateBatch}>
              <Plus className="h-4 w-4 mr-2" />
              New Batch
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
            <Button
              variant="outline"
              className="border-gray-300 bg-transparent"
              onClick={onClickImportCSV}
              disabled={!selectedBatch || importing}
            >
              <Upload className="h-4 w-4 mr-2" />
              {importing && importProgress ? `Importing ${importProgress.processed}/${importProgress.total}` : "Import CSV"}
            </Button>
            <Button
              className="bg-teal-500 hover:bg-teal-600 text-white"
              onClick={onStartCallBatch}
              disabled={!selectedBatch || starting}
            >
              <Play className="h-4 w-4 mr-2" />
              {starting ? "Starting..." : "Start Call Batch"}
            </Button>
            <Button
              variant="outline"
              onClick={onStartFullBatch}
              disabled={!selectedBatch || starting}
            >
              <Play className="h-4 w-4 mr-2" />
              Start Full Batch
            </Button>
          </div>
        </div>

        {/* Provider readiness handled server-side; no legacy transport warnings */}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Batches/Contacts */}
          <div className="lg:col-span-2">
            {selectedBatch ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedBatch(null)}>
                        ← Back
                      </Button>
                      <CardTitle className="text-black">
                        {batchMap.get(selectedBatch)?.name || "Contacts"}
                      </CardTitle>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={onClickImportCSV} disabled={importing}>
                        <Upload className="h-4 w-4 mr-2" />
                        {importing && importProgress ? `Importing ${importProgress.processed}/${importProgress.total}` : "Import CSV"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {selectedBatchContacts.length === 0 && (
                      <div className="text-sm text-gray-500">No contacts in this batch yet.</div>
                    )}
                    {selectedBatchContacts.map((contact) => {
                      const phone = contact.phone || ""
                      const acceptable = CC_PLUS_9_REGEX.test(phone.trim())
                      return (
                        <div key={contact.id} className="flex items-center gap-4 p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-black">{contact.name || contact.phone || "Unknown"}</span>
                              {!acceptable && (
                                <Badge className="bg-red-100 text-red-800 border border-red-300">Flagged Phone</Badge>
                              )}
                            </div>
                            <div className="text-sm text-gray-600">
                              {(contact.phone || "No phone")} • {(contact.email || "No email")} • {(contact.notes || "No notes")}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" disabled title="Edit disabled">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-600" disabled title="Delete disabled">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-black">Contact Batches</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {contactBatches.length === 0 && (
                      <div className="text-sm text-gray-500">No contact batches yet. Create one to get started.</div>
                    )}
                    {contactBatches.map((batch) => (
                      <div
                        key={batch.id}
                        className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                        onClick={() => { setSelectedBatch(batch.id) }}
                      >
                        <Users className="h-5 w-5 text-teal-600" />
                        <div className="flex-1">
                          <div className="font-medium text-black">{batch.name}</div>
                          <div className="text-sm text-gray-600">
                            {batch.contact_count} contacts • Created {format(new Date(batch.created_at), "MMM d, yyyy")}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.stopPropagation()
                              const newName = prompt("Enter new batch name:", batch.name)
                              if (newName && newName.trim()) handleRenameBatch(batch.id, newName.trim())
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.stopPropagation()
                              handleDeleteBatch(batch.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: Call Scheduling (24h) Info Panel */}
          <div>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-black">Call Scheduling</CardTitle>
                <Button variant="ghost" size="sm" onClick={refreshPanel} disabled={!selectedBatch}>
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-600 mb-3">
                  Transport queue and logs exist for 24 hours and then auto-prune. All numbers are sent to backend; red flag only indicates a non-conforming format. No actions are blocked.
                </div>

                {!selectedBatch && (
                  <div className="text-sm text-gray-500">Select a batch to view recent sessions and logs.</div>
                )}

                {selectedBatch && (
                  <>
                    <div className="mb-4">
                      <div className="text-xs text-gray-500">Selected Batch</div>
                      <div className="text-sm">
                        <span className="font-medium">{batchMap.get(selectedBatch)?.name}</span>{" "}
                        <span className="text-gray-500">({batchMap.get(selectedBatch)?.contact_count ?? 0} contacts)</span>
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="text-xs text-gray-500 mb-1">Schedule (UTC)</div>
                      <div className="grid grid-cols-1 gap-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="cs-earliest" className="w-28 text-xs text-gray-500">Earliest At</Label>
                          <Input id="cs-earliest" placeholder="YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss" value={earliestAt} onChange={(e: any) => setEarliestAt(e.target.value)} />
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="cs-latest" className="w-28 text-xs text-gray-500">Latest At</Label>
                          <Input id="cs-latest" placeholder="YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss" value={latestAt} onChange={(e: any) => setLatestAt(e.target.value)} />
                        </div>
                        <div className="text-xs text-gray-500">
                          Timezone: Africa/Kampala (UTC+3). Values are converted to UTC before sending. Leave blank to use the provider default window.
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Button variant="outline" size="sm" onClick={() => { const p = presetNowWindow(); setEarliestAt(p.earliest); setLatestAt(p.latest); }}>Start Now (next 6h)</Button>
                          <Button variant="outline" size="sm" onClick={() => { const p = presetTodayBusiness(); setEarliestAt(p.earliest); setLatestAt(p.latest); }}>Today 09:00–21:00</Button>
                          <Button variant="outline" size="sm" onClick={() => { const p = presetTomorrowBusiness(); setEarliestAt(p.earliest); setLatestAt(p.latest); }}>Tomorrow 09:00–21:00</Button>
                          <Button variant="ghost" size="sm" onClick={() => { setEarliestAt(""); setLatestAt(""); }}>Clear</Button>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {(() => { const n = batchMap.get(selectedBatch!)?.contact_count ?? 0; const c = n > 0 ? Math.ceil(n / 500) : 0; return `Batch size: ${n}. Will create about ${c || 1} campaign${(c || 1) > 1 ? 's' : ''} (max 500 contacts each).`; })()}
                        </div>
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="text-xs text-gray-500 mb-1">Latest Session</div>
                      {lastSession ? (
                        <div className="border rounded-md p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-blue-100 text-blue-800 capitalize">{lastSession.status}</Badge>
                              <div className="text-xs text-gray-500">
                                {format(new Date(lastSession.created_at), "PPpp")}
                              </div>
                            </div>
                            <div className="text-xs text-gray-600">
                              Enq: {lastSession.totals?.enqueued ?? 0} • Fail: {lastSession.totals?.errored ?? 0}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">No sessions yet for this batch.</div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-500 mb-1">Recent Logs</div>
                        {lastSession && recentLogs.length > 0 && (
                          <div className="text-xs text-gray-500">Showing {recentLogs.length}{logsHasMore ? "+" : ""}</div>
                        )}
                      </div>
                      {recentLogs.length === 0 ? (
                        <div className="text-sm text-gray-500">No recent logs.</div>
                      ) : (
                        <>
                          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                            {recentLogs.map((log) => {
                              const isFailed = log.action === "failed"
                              const isEnq = log.action === "enqueued"
                              const flaggedInvalid = !!log.detail?.flaggedInvalid
                              return (
                                <div key={log.id} className="text-xs flex items-center justify-between border rounded-md p-2">
                                  <div className="flex items-center gap-2">
                                    <Badge className={isFailed ? "bg-red-100 text-red-800" : isEnq ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                                      {log.action}
                                    </Badge>
                                    {flaggedInvalid && (
                                      <Badge className="bg-red-50 text-red-700 border border-red-200">Flagged</Badge>
                                    )}
                                    <div className="text-gray-700">
                                      {(log.detail?.name ? `${log.detail?.name} • ` : "")}{log.detail?.phone || "unknown"}
                                    </div>
                                  </div>
                                  <div className="text-gray-500">{format(new Date(log.created_at), "HH:mm:ss")}</div>
                                </div>
                              )
                            })}
                          </div>
                          <div className="flex justify-end mt-2">
                            {lastSession && logsHasMore && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={logsLoading}
                                onClick={() => fetchLogsMoreForSession(lastSession.id)}
                              >
                                {logsLoading ? "Loading..." : `Load ${LOGS_PAGE_SIZE} more`}
                              </Button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Optional: Quick Add Single Contact to Selected Batch (no format guidelines, no suppression) */}
            {selectedBatch && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-black">Quick Add Contact</CardTitle>
                </CardHeader>
                <CardContent>
                  <QuickAddContact
                    batchId={selectedBatch}
                    onAdded={async () => {
                      await fetchBatchContacts(selectedBatch)
                      // also update count in memory
                      setContactBatches((prev) =>
                        prev.map((b) => (b.id === selectedBatch ? { ...b, contact_count: b.contact_count + 1 } : b))
                      )
                    }}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Lightweight widget to add a single contact to the selected batch without enforcing phone format.
// Shows a small red flag note if the phone doesn't match CC_PLUS_9_REGEX, but still allows add.
function QuickAddContact({ batchId, onAdded }: { batchId: string; onAdded: () => Promise<void> }) {
  const supabase = createClient()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const flagged = phone.trim() !== "" && !CC_PLUS_9_REGEX.test(normalizeLoosePhone(phone))

  const add = async () => {
    setSaving(true)
    try {
      const { data: auth } = await (supabase as any).auth.getUser?.()
      const userId = auth?.user?.id as string | undefined
      if (!userId) throw new Error("Not authenticated")

      const normalized = normalizeLoosePhone(phone)

      const { data: contactRow, error: contactErr } = await supabase
        .from("contacts")
        .insert({
          user_id: userId,
          name: name.trim() || null,
          email: email.trim() || null,
          phone: normalized || phone.trim(),
          notes: notes.trim() || null,
        })
        .select("id")
        .single()

      if (contactErr || !contactRow) throw contactErr || new Error("Failed to insert contact")

      const { error: snapshotErr } = await supabase
        .from("batch_contacts")
        .insert({
          batch_id: batchId,
          contact_id: contactRow.id,
          name: name.trim() || null,
          email: email.trim() || null,
          phone: normalized || phone.trim(),
          notes: notes.trim() || null,
        })

      if (snapshotErr) throw snapshotErr

      setName("")
      setEmail("")
      setPhone("")
      setNotes("")
      await onAdded()
    } catch (e) {
      console.error(e)
      alert("Failed to add contact")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="qa-name">Name (optional)</Label>
          <Input id="qa-name" value={name} onChange={(e: any) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="qa-email">Email (optional)</Label>
          <Input id="qa-email" type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="qa-phone">Phone</Label>
          <Input id="qa-phone" placeholder="e.g., +256778825312" value={phone} onChange={(e: any) => setPhone(e.target.value)} />
          {flagged && <div className="text-xs text-red-600 mt-1">This number format is flagged but will still be sent.</div>}
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="qa-notes">Notes (optional)</Label>
          <Textarea id="qa-notes" rows={3} value={notes} onChange={(e: any) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={add} disabled={saving} className="bg-indigo-500 hover:bg-indigo-600">
          {saving ? "Adding..." : "Add to Batch"}
        </Button>
      </div>
    </div>
  )
}
