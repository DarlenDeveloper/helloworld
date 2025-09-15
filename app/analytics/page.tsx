"use client"

/* using app-level route segment config from layout */

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
// Recharts type compatibility shim for React 19/TS 5
const XAxisAny: any = XAxis
const YAxisAny: any = YAxis

interface CallHistoryRow {
  id: string
  user_id: string
  status: "completed" | "failed" | "busy" | "no_answer" | "voicemail"
  ai_summary: string | null
  notes: string | null
  call_date: string // ISO
}

interface FollowUpDatum { name: string; value: number; color: string }
interface TalkingPointDatum { name: string; value: number; color: string; calls: number }

const STATUS_COLORS: Record<string, string> = {
  completed: "#14b8a6",
  missed: "#ef4444",
}

export default function AnalyticsPage() {
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const [selectedDateRange, setSelectedDateRange] = useState<Date[]>(() => {
    // Default to last 7 days inclusive
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - 6)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    const arr: Date[] = []
    const d = new Date(start)
    while (d <= end) {
      arr.push(new Date(d))
      d.setDate(d.getDate() + 1)
    }
    return arr
  })
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [showModal, setShowModal] = useState(false)
  const [modalData, setModalData] = useState<any>(null)
  const [modalType, setModalType] = useState<"calls" | "status" | "talking">("calls")

  const [callsData, setCallsData] = useState<{ date: string; fullDate: Date; dateLabel: string; calls: number }[]>([])
  const [followUpData, setFollowUpData] = useState<FollowUpDatum[]>([])
  const [talkingPointsData, setTalkingPointsData] = useState<TalkingPointDatum[]>([])

  useEffect(() => {
    // Create the Supabase client only on the client
    if (!supabaseRef.current) {
      supabaseRef.current = createClient()
    }
    const supabase = supabaseRef.current
    if (!supabase) return

    let unsubscribe: (() => void) | undefined

    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      if (selectedDateRange.length < 2) return

      const start = new Date(selectedDateRange[0])
      const end = new Date(selectedDateRange[selectedDateRange.length - 1])
      // normalize to midnight boundaries
      const startISO = new Date(start.getFullYear(), start.getMonth(), start.getDate()).toISOString()
      const endISO = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).toISOString()

      const { data, error } = await supabase
        .from("call_history")
        .select("id,user_id,status,ai_summary,notes,call_date")
        .eq("user_id", user.id)
        .gte("call_date", startISO)
        .lte("call_date", endISO)
        .order("call_date", { ascending: true })

      if (error) {
        console.error("Analytics fetch error:", error)
        setCallsData([])
        setFollowUpData([])
        setTalkingPointsData([])
      } else {
        const rows = (data || []) as CallHistoryRow[]
        const days = getDaysArray(new Date(startISO), new Date(endISO))

        // callsData will be computed from the calls table below to stay consistent

        // Status breakdown from calls table
        const { data: callsRows, error: callsErr } = await supabase
          .from("calls")
          .select("id,user_id,status,created_at")
          .eq("user_id", user.id)
          .gte("created_at", startISO)
          .lte("created_at", endISO)

        if (callsErr) {
          console.error("Status breakdown fetch error (calls):", callsErr)
          setFollowUpData([])
          setCallsData([])
        } else {
          let completed = 0,
            missed = 0
          ;(callsRows || []).forEach((r: any) => {
            if (r.status === "completed") completed++
            else if (r.status === "missed") missed++
          })
          const follow: FollowUpDatum[] = [
            { name: "completed", value: completed, color: STATUS_COLORS["completed"] || "#14b8a6" },
            { name: "missed", value: missed, color: STATUS_COLORS["missed"] || "#ef4444" },
          ]
          setFollowUpData(follow)

          // Compute Number of Calls (per-day) from calls table within selected range
          const countsByDay = new Map<string, number>()
          days.forEach((d) => countsByDay.set(dateKey(d), 0))
          ;(callsRows || []).forEach((r: any) => {
            const key = dateKey(new Date(r.created_at))
            countsByDay.set(key, (countsByDay.get(key) || 0) + 1)
          })
          const newCallsData = days.map((d) => ({
            date: d.toLocaleDateString("en-US", { weekday: "short" }),
            fullDate: d,
            dateLabel: `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getMonth() + 1}/${d.getDate()}/${d
              .getFullYear()
              .toString()
              .slice(-2)}`,
            calls: countsByDay.get(dateKey(d)) || 0,
          }))
          setCallsData(newCallsData)
        }

        // Talking points from summaries/notes
        const text = rows
          .map((r) => (r.ai_summary || r.notes || ""))
          .join(" ")
          .toLowerCase()
        const tokens = text.match(/[a-zA-Z][a-zA-Z\-']{2,}/g) || []
        const stop = new Set([
          "the","and","for","you","with","that","this","from","have","your","are","was","were","but","not","they","their","them","our","out","had","has","all","can","will","would","could","should","about","there","what","when","where","how","why","which","been","also","into","more","less","call","calls","phone","number","agent","customer","client","email","address","hello","hi","thanks","thank","regarding","discuss","issue","issues","help","support"
        ])
        const freq = new Map<string, number>()
        for (const t of tokens) {
          if (stop.has(t)) continue
          if (t.length < 4) continue
          freq.set(t, (freq.get(t) || 0) + 1)
        }
        const top = Array.from(freq.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
        const totalTop = top.reduce((s, [, n]) => s + n, 0) || 1
        const palette = ["#14b8a6", "#3b82f6", "#f59e0b", "#ef4444"]
        const talking: TalkingPointDatum[] = top.map(([name, count], i) => ({
          name: name.replace(/\b\w/g, (c) => c.toUpperCase()),
          value: Math.round((count / totalTop) * 100),
          color: palette[i] || "#94a3b8",
          calls: count,
        }))
        setTalkingPointsData(talking)
      }

      // subscribe for updates in window
      const channel = supabase
        .channel("analytics_updates")
        .on("postgres_changes", { event: "*", schema: "public", table: "call_history" }, () => {
          run()
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, () => {
          run()
        })
        .subscribe()
      unsubscribe = () => supabase.removeChannel(channel)
    }

    run()
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [selectedDateRange])

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days: (Date | null)[] = []

    for (let i = 0; i < startingDayOfWeek; i++) days.push(null)
    for (let day = 1; day <= daysInMonth; day++) days.push(new Date(year, month, day))

    return days
  }

  // Contiguous range picker with a max span of 7 days
  const handleDateClick = (date: Date | null) => {
    if (!date) return
    const clicked = new Date(date.getFullYear(), date.getMonth(), date.getDate())

    if (selectedDateRange.length === 0) {
      setSelectedDateRange([clicked])
      return
    }

    if (selectedDateRange.length === 1) {
      const a = new Date(selectedDateRange[0].getFullYear(), selectedDateRange[0].getMonth(), selectedDateRange[0].getDate())
      const start = new Date(Math.min(a.getTime(), clicked.getTime()))
      const end = new Date(Math.max(a.getTime(), clicked.getTime()))
      const msPerDay = 24 * 3600 * 1000
      const span = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1
      const capped = Math.min(span, 7)
      const cappedEnd = new Date(start)
      cappedEnd.setDate(start.getDate() + capped - 1)

      const arr: Date[] = []
      const d = new Date(start)
      while (d <= cappedEnd) {
        arr.push(new Date(d))
        d.setDate(d.getDate() + 1)
      }
      setSelectedDateRange(arr)
      return
    }

    // If a range already exists, start a new range from the clicked day
    setSelectedDateRange([clicked])
  }

  const isDateSelected = (date: Date | null) => {
    if (!date) return false
    return selectedDateRange.some((d) => d.toDateString() === date.toDateString())
  }

  const isDateInRange = (date: Date | null) => {
    if (!date || selectedDateRange.length < 2) return false
    const sortedRange = [...selectedDateRange].sort((a, b) => a.getTime() - b.getTime())
    return date >= sortedRange[0] && date <= sortedRange[sortedRange.length - 1]
  }

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentMonth((prev) => {
      const newMonth = new Date(prev)
      if (direction === "prev") newMonth.setMonth(prev.getMonth() - 1)
      else newMonth.setMonth(prev.getMonth() + 1)
      return newMonth
    })
  }

  const clearSelection = () => setSelectedDateRange([])

  const handleBarClick = (data: any) => {
    setModalData(data)
    setModalType("calls")
    setShowModal(true)
  }

  const handlePieClick = (data: any, type: "status" | "talking") => {
    setModalData(data)
    setModalType(type)
    setShowModal(true)
  }

  const downloadAllCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,"

    csvContent += "CALLS DATA\n"
    csvContent += "Date,Day,Number of Calls\n"
    callsData.forEach((item) => {
      csvContent += `${item.fullDate.toLocaleDateString()},${item.date},${item.calls}\n`
    })

    csvContent += "\nSTATUS BREAKDOWN\n"
    csvContent += "Status,Count\n"
    followUpData.forEach((item) => {
      csvContent += `${item.name},${item.value}\n`
    })

    csvContent += "\nCUSTOMER TALKING POINTS\n"
    csvContent += "Topic,Percentage,Mentions\n"
    talkingPointsData.forEach((item) => {
      csvContent += `${item.name},${item.value}%,${item.calls}\n`
    })

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", "analytics_report.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const downloadAllPDF = () => {
    console.log("PDF download initiated for analytics report")
    alert("Combined PDF report download would start here")
  }

  const days = getDaysInMonth(currentMonth)
  const monthYear = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })

  return (
    <div className="ml-20 p-6 bg-white min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-black mb-2">Analytics Dashboard</h1>
        <p className="text-gray-600">Analyze your AI agent performance and customer interactions</p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-teal-500" />
            Date Range Selection (Max 7 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-4">
              <Button variant="outline" onClick={() => navigateMonth("prev")}>
                ‹
              </Button>
              <h3 className="text-lg font-semibold">{monthYear}</h3>
              <Button variant="outline" onClick={() => navigateMonth("next")}>
                ›
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((date, index) => (
                <button
                  key={index}
                  onClick={() => handleDateClick(date)}
                  disabled={!date}
                  className={`
                    p-2 text-sm rounded-md transition-colors
                    ${!date ? "invisible" : ""}
                    ${isDateSelected(date) ? "bg-teal-500 text-white" : ""}
                    ${isDateInRange(date) && !isDateSelected(date) ? "bg-teal-100 text-teal-700" : ""}
                    ${date && !isDateSelected(date) && !isDateInRange(date) ? "hover:bg-gray-100" : ""}
                    ${date && selectedDateRange.length >= 7 && !isDateSelected(date) ? "opacity-50 cursor-not-allowed" : ""}
                  `}
                >
                  {date?.getDate()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">
                Selected: {selectedDateRange.length} day{selectedDateRange.length !== 1 ? "s" : ""}
                {selectedDateRange.length > 0 && (
                  <span className="ml-2">
                    ({selectedDateRange[0]?.toLocaleDateString()} - {selectedDateRange[selectedDateRange.length - 1]?.toLocaleDateString()})
                  </span>
                )}
              </p>
            </div>
            {selectedDateRange.length > 0 && (
              <Button variant="outline" onClick={clearSelection} className="text-sm bg-transparent">
                Clear Selection
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Analytics Widgets */}
      {selectedDateRange.length >= 2 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8 mb-8">
          <Card className="col-span-1 lg:col-span-2 xl:col-span-1">
            <CardHeader>
              <CardTitle>Number of Calls</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={callsData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxisAny dataKey="dateLabel" angle={-45} textAnchor="end" height={80} fontSize={12} />
                  <YAxisAny />
                  <Tooltip />
                  <Bar dataKey="calls" fill="#14b8a6" onClick={handleBarClick} style={{ cursor: "pointer" }} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Status Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={followUpData} cx="50%" cy="50%" outerRadius={80} dataKey="value" onClick={(data) => handlePieClick(data, "status")} style={{ cursor: "pointer" }}>
                    {followUpData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value}`, "Count"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {followUpData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: item.color }}></div>
                      <span className="text-sm">{item.name}</span>
                    </div>
                    <span className="text-sm font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Customer Talking Points */}
          <Card>
            <CardHeader>
              <CardTitle>Customer Talking Points</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={talkingPointsData} cx="50%" cy="50%" outerRadius={80} dataKey="value" onClick={(data) => handlePieClick(data, "talking")} style={{ cursor: "pointer" }}>
                    {talkingPointsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name, props) => [`${value}% (${props.payload.calls} mentions)`, "Interest"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {talkingPointsData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: item.color }}></div>
                      <span className="text-sm">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{item.value}%</div>
                      <div className="text-xs text-gray-500">{item.calls} mentions</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="mb-8">
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Please select at least 2 dates to view analytics</p>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedDateRange.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Export Analytics Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button onClick={downloadAllCSV} className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600">
                Download CSV Report
              </Button>
              <Button onClick={downloadAllPDF} variant="outline" className="flex items-center gap-2 bg-transparent">
                Download PDF Report
              </Button>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              Export includes call data, status breakdown, and customer talking points for selected date range
            </p>
          </CardContent>
        </Card>
      )}

      {/* Download Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Download Data</DialogTitle>
            <DialogDescription>
              {modalType === "calls" && `Download call data for ${modalData?.dateLabel || "selected date"}`}
              {modalType === "status" && `Download contacts for status: ${modalData?.name || "selected"}`}
              {modalType === "talking" && `Download contacts interested in ${modalData?.name || "selected topic"}`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-4 mt-4">
            <Button onClick={downloadAllCSV} className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600">
              Download CSV
            </Button>
            <Button onClick={downloadAllPDF} variant="outline" className="flex items-center gap-2 bg-transparent">
              Download PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function getDaysArray(start: Date, end: Date) {
  const arr: Date[] = []
  const dt = new Date(start)
  while (dt <= end) {
    arr.push(new Date(dt))
    dt.setDate(dt.getDate() + 1)
  }
  return arr
}
