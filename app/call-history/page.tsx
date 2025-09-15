"use client"

import { useState, useEffect } from "react"
import { Calendar, Search, Phone, Clock } from "lucide-react"
import { DayPicker } from "react-day-picker"
import type { DateRange } from "react-day-picker"
import "react-day-picker/dist/style.css"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"

export default function CallHistoryPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCampaign, setSelectedCampaign] = useState("all")
  const [campaignOptions, setCampaignOptions] = useState<string[]>(["all"]) 
  const [selectedFilter, setSelectedFilter] = useState("all")
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
  const [callHistory, setCallHistory] = useState<any[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)

  const supabase = createClient()

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
    if (selectedRange?.from && selectedRange?.to) {
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

      await fetchCallsAndCampaigns(user.id)

      // Real-time subscription scoped by user_id (calls table)
      const subscription = supabase
        .channel("user:calls")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "calls", filter: `user_id=eq.${user.id}` },
          () => {
            fetchCallsAndCampaigns(user.id)
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(subscription)
      }
    }

    init()
  }, [supabase])

  const fetchCallsAndCampaigns = async (userId: string) => {
    try {
      // Fetch call history for current user
      const { data, error } = await supabase
        .from("calls")
        .select("id, call_type, status, customer_phone, duration, notes, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200)

      if (error) {
        console.error("Error fetching call history:", JSON.stringify(error, null, 2))
        setFetchError("Failed to fetch call history. Please try again later.")
      } else {
        // Format rows from calls table
        const formattedCalls = (data || []).map((call: any) => {
          const mappedStatus =
            call.status === "completed"
              ? "Resolved"
              : call.status === "missed"
              ? "No Response"
              : "Not Resolved" // in_progress -> Not Resolved (to match existing filters)

          const dt = new Date(call.created_at)
          return {
            id: call.id,
            status: mappedStatus,
            contact: call.customer_phone || "Unknown",
            dateTime: dt.toLocaleString(),
            ts: dt.getTime(),
            statusColor:
              mappedStatus === "Resolved"
                ? "bg-green-500"
                : mappedStatus === "No Response"
                ? "bg-gray-500"
                : "bg-red-500",
            summary: call.notes || "No summary available",
            duration: call.duration || 0,
            campaignName: null,
          }
        })
        setCallHistory(formattedCalls)
        setFetchError(null)
      }

      // Load campaign names for filter options
      const { data: camps, error: campsErr } = await supabase
        .from("campaigns")
        .select("name")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

      if (!campsErr) {
        const names = Array.from(new Set(["all", ...((camps || []).map((c: any) => c.name).filter(Boolean))]))
        setCampaignOptions(names)
      }
    } catch (e) {
      console.error(e)
      setFetchError("Unexpected error occurred.")
    }
  }

  // Filter data based on current filters
  const filteredData = callHistory.filter((call) => {
    const matchesSearch =
      call.contact?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.summary?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCampaign = selectedCampaign === "all" ||
      (typeof call.campaignName === "string" && call.campaignName.toLowerCase().includes(selectedCampaign.toLowerCase()))

    const matchesFilter = selectedFilter === "all" || call.status?.toLowerCase().replace(" ", "-") === selectedFilter

    const matchesDate = (() => {
      if (!selectedRange?.from || !selectedRange?.to) return true
      const start = startOfDay(selectedRange.from).getTime()
      const end = endOfDay(selectedRange.to).getTime()
      const ts = call.ts ?? 0
      return ts >= start && ts <= end
    })()

    return matchesSearch && matchesCampaign && matchesFilter && matchesDate
  })

  // Calculate metrics based on filtered data
  const totalCalls = filteredData.length

  // Convert duration in seconds to mm:ss format
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Calculate average call duration in mm:ss format
  const averageDurationSeconds =
    filteredData.reduce((acc, call) => acc + (call.duration || 0), 0) /
    (filteredData.length || 1)
  const averageCallDuration = formatDuration(Math.round(averageDurationSeconds))

  const handleDownloadPDF = () => {
    // Mock PDF download functionality
    console.log("[v0] Downloading PDF report for call history")
    alert("PDF report downloaded successfully!")
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Resolved":
        return "bg-green-100 text-green-800"
      case "Not Resolved":
        return "bg-red-100 text-red-800"
      case "No Response":
        return "bg-gray-100 text-gray-800"
      case "Busy":
        return "bg-yellow-100 text-yellow-800"
      case "Voicemail":
        return "bg-blue-100 text-blue-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <div className="ml-20 p-6 bg-white min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-black">Call History</h1>
        <div className="flex gap-3">
          <Dialog open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 bg-transparent">
                <Calendar className="h-4 w-4" />
                {rangeLabel}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Select Date Range</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <Button variant="outline" className="bg-transparent" onClick={() => { setSelectedRange(undefined); setRangeLabel('All time'); setIsCalendarOpen(false); }}>Clear</Button>
                    <Button onClick={applyRange} className="bg-teal-500 hover:bg-teal-600">Apply</Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            onClick={handleDownloadPDF}
            className="bg-teal-500 hover:bg-teal-600 text-white"
          >
            Download PDF
          </Button>
        </div>
      </div>

      {/* Metrics Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Calls</CardTitle>
            <Phone className="h-4 w-4 text-teal-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-black">{totalCalls}</div>
            <p className="text-xs text-gray-500">{rangeLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Average Call Duration</CardTitle>
            <Clock className="h-4 w-4 text-teal-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-black">{averageCallDuration}</div>
            <p className="text-xs text-gray-500">Based on {totalCalls} calls</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search contacts, phone numbers, or summaries..."
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select Campaign" />
          </SelectTrigger>
          <SelectContent>
            {campaignOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt === "all" ? "All Campaigns" : opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedFilter} onValueChange={setSelectedFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="not-resolved">Not Resolved</SelectItem>
            <SelectItem value="no-response">No Response</SelectItem>
            <SelectItem value="busy">Busy</SelectItem>
            <SelectItem value="voicemail">Voicemail</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Call History Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Campaign
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Call Summary
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(call.status)}`}
                      >
                        {call.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{call.contact}</div>
                        <div className="text-sm text-gray-500">{call.contact}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{call.dateTime}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{call.campaignName || "N/A"}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                      <div className="truncate" title={call.summary}>
                        {call.summary}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredData.length === 0 && (
            <div className="text-center py-8 text-gray-500">No calls found matching your filters.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
