"use client"

import { useEffect, useMemo, useState } from "react"
import { Calendar, Search } from "lucide-react"
import { DayPicker, type DateRange } from "react-day-picker"
import "react-day-picker/dist/style.css"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

type WebFormRecord = {
  id: string
  form_name: string | null
  name: string | null
  email: string | null
  phone: string | null
  message: string | null
  submitted_at: string | null
  created_at: string | null
  metadata?: Record<string, any> | null
}

export default function WebFormsPage() {
  const supabase = createClient()

  const [searchTerm, setSearchTerm] = useState("")
  const [selectedForm, setSelectedForm] = useState("all")
  const [formOptions, setFormOptions] = useState<string[]>(["all"])
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - 6)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return { from: start, to: end }
  })
  const [rangeLabel, setRangeLabel] = useState("Last 7 days")
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)

  const [rows, setRows] = useState<WebFormRecord[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)


  function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x }
  function endOfDay(d: Date) { const x = new Date(d); x.setHours(23,59,59,999); return x }
  function formatDate(d: Date) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  function applyPreset(preset: 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'all') {
    const now = new Date()
    if (preset === 'today') {
      const from = startOfDay(now)
      const to = endOfDay(now)
      setSelectedRange({ from, to })
      setRangeLabel('Today')
    } else if (preset === 'last7') {
      const to = endOfDay(now)
      const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6))
      setSelectedRange({ from, to })
      setRangeLabel('Last 7 days')
    } else if (preset === 'thisMonth') {
      const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1))
      const to = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0))
      setSelectedRange({ from, to })
      setRangeLabel('This month')
    } else if (preset === 'lastMonth') {
      const from = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1))
      const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0))
      setSelectedRange({ from, to })
      setRangeLabel('Last month')
    } else {
      setSelectedRange(undefined)
      setRangeLabel('All time')
    }
    setIsCalendarOpen(false)
  }
  function applyRange() {
    if (selectedRange && selectedRange.from && selectedRange.to) {
      setRangeLabel(`${formatDate(selectedRange.from)} - ${formatDate(selectedRange.to)}`)
    } else {
      setRangeLabel('All time')
    }
    setIsCalendarOpen(false)
  }

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        setFetchError("User not authenticated")
        return
      }

      const uid = user.id
      await fetchFormsAndOptions(uid)

      const subscription = supabase
        .channel("web_forms_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "web_forms", filter: `user_id=eq.${uid}` },
          () => { fetchFormsAndOptions(uid) }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(subscription)
      }
    }

    init()
  }, [supabase])

  const fetchFormsAndOptions = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from("web_forms")
        .select("*")
        .eq("user_id", uid)
        .order("submitted_at", { ascending: false })
        .limit(500)

      if (error) {
        console.error("Error fetching web forms:", JSON.stringify(error, null, 2))
        setFetchError("Failed to fetch web forms data. Please try again later.")
      } else {
        const list = (data || []) as WebFormRecord[]
        setRows(list)
        const names = Array.from(new Set(["all", ...list.map((r) => r.form_name || "Unnamed Form")]))
        setFormOptions(names)
        setFetchError(null)
      }
    } catch (e) {
      console.error(e)
      setFetchError("Unexpected error occurred.")
    }
  }

  const filteredRows = useMemo(() => {
    return rows.filter((r: WebFormRecord) => {
      const txt = `${r.name || ""} ${r.email || ""} ${r.phone || ""} ${r.message || ""} ${r.form_name || ""}`.toLowerCase()
      const matchesSearch = txt.includes(searchTerm.toLowerCase())

      const matchesForm = selectedForm === "all" ||
        (r.form_name || "Unnamed Form").toLowerCase() === selectedForm.toLowerCase()

      const matchesDate = (() => {
        if (!selectedRange || !selectedRange.from || !selectedRange.to) return true
        const start = startOfDay(selectedRange.from).getTime()
        const end = endOfDay(selectedRange.to).getTime()
        const ts = new Date(r.submitted_at || r.created_at || Date.now()).getTime()
        return ts >= start && ts <= end
      })()

      return matchesSearch && matchesForm && matchesDate
    })
  }, [rows, searchTerm, selectedForm, selectedRange])

  const newCount = useMemo(() => {
    const now = Date.now()
    const dayAgo = now - 24 * 60 * 60 * 1000
    return rows.filter((r: WebFormRecord) => {
      const ts = new Date(r.submitted_at || r.created_at || Date.now()).getTime()
      return ts >= dayAgo
    }).length
  }, [rows])

  return (
    <div className="ml-20 p-6 bg-white min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-black">Web Forms</h1>
          {newCount > 0 && (
            <span className="ml-1">
              <Badge variant="outline" className="border-teal-300 text-teal-700 bg-teal-50">{newCount}</Badge>
            </span>
          )}
        </div>

        <Dialog open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2 bg-transparent">
              <Calendar className="h-4 w-4" />
              {rangeLabel}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl" aria-describedby="date-range-desc">
            <DialogHeader>
              <DialogTitle id="date-range-title">Select Date Range</DialogTitle>
            </DialogHeader>
            <div className="sr-only" id="date-range-desc">
              Choose a preset or a custom range using the calendar. Apply to filter submissions.
            </div>
            <div role="document" aria-labelledby="date-range-title" className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">Presets</div>
                <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
                  <Button variant="outline" className="justify-start bg-transparent" onClick={() => applyPreset('today')}>Today</Button>
                  <Button variant="outline" className="justify-start bg-transparent" onClick={() => applyPreset('last7')}>Last 7 days</Button>
                  <Button variant="outline" className="justify-start bg-transparent" onClick={() => applyPreset('thisMonth')}>This month</Button>
                  <Button variant="outline" className="justify-start bg-transparent" onClick={() => applyPreset('lastMonth')}>Last month</Button>
                  <Button variant="outline" className="justify-start bg-transparent" onClick={() => applyPreset('all')}>All time</Button>
                </div>
              </div>
              <div className="md:col-span-2">
                <DayPicker
                  mode="range"
                  numberOfMonths={2}
                  showOutsideDays
                  selected={selectedRange}
                  onSelect={setSelectedRange}
                  weekStartsOn={1}
                  captionLayout="dropdown"
                />
                <div className="flex justify-end gap-2 mt-2">
                  <Button
                    variant="outline"
                    className="bg-transparent"
                    onClick={() => {
                      setSelectedRange(undefined)
                      setRangeLabel('All time')
                      setIsCalendarOpen(false)
                    }}
                  >
                    Clear
                  </Button>
                  <Button onClick={applyRange} className="bg-teal-500 hover:bg-teal-600">Apply</Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search name, email, phone, or message..."
            value={searchTerm}
            onChange={(e: any) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={selectedForm} onValueChange={setSelectedForm}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select Form" />
          </SelectTrigger>
          <SelectContent>
            {formOptions.map((opt: string) => (
              <SelectItem key={opt} value={opt}>
                {opt === "all" ? "All Forms" : opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-black text-base">Submissions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Form</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted At</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredRows.map((row: WebFormRecord) => {
                  const submitted = new Date(row.submitted_at || row.created_at || Date.now()).toLocaleString()
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.form_name || "Unnamed Form"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.name || "-"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.email || "-"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.phone || "-"}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                        <div className="truncate" title={row.message || ""}>
                          {row.message || "-"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{submitted}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {filteredRows.length === 0 && (
            <div className="text-center py-8 text-gray-500">No submissions found matching your filters.</div>
          )}
          {fetchError && (
            <div className="text-center py-4 text-red-600">{fetchError}</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}