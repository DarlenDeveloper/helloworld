"use client"

import { useState, useEffect } from "react"
import { Calendar, Download, Search, Phone, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"

export default function CallHistoryPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCampaign, setSelectedCampaign] = useState("all")
  const [selectedFilter, setSelectedFilter] = useState("all")
  const [dateRange, setDateRange] = useState<string>("Last 7 days")
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [callHistory, setCallHistory] = useState<any[]>([])

  const supabase = createClient()

  useEffect(() => {
    // Fetch initial call history data
    const fetchCallHistory = async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("*")
        .order("dateTime", { ascending: false })

      if (error) {
        console.error("Error fetching call history:", error)
      } else {
        setCallHistory(data || [])
      }
    }

    fetchCallHistory()

    // Set up real-time subscription to calls table
    const subscription = supabase
      .channel("public:calls")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls" },
        (payload) => {
          setCallHistory((current) => {
            switch (payload.eventType) {
              case "INSERT":
                return [payload.new, ...current]
              case "UPDATE":
                return current.map((call) =>
                  call.id === payload.new.id ? payload.new : call
                )
              case "DELETE":
                return current.filter((call) => call.id !== payload.old.id)
              default:
                return current
            }
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [supabase])

  // Filter data based on current filters
  const filteredData = callHistory.filter((call) => {
    const matchesSearch =
      call.contact?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.phone?.includes(searchTerm) ||
      call.summary?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCampaign =
      selectedCampaign === "all" || call.campaign?.toLowerCase().includes(selectedCampaign.toLowerCase())

    const matchesFilter = selectedFilter === "all" || call.status?.toLowerCase().replace(" ", "-") === selectedFilter

    return matchesSearch && matchesCampaign && matchesFilter
  })

  // Calculate metrics based on filtered data
  const totalCalls = filteredData.length
  const averageCallDuration = "4:32" // Mock average

  const handleDownloadPDF = () => {
    // Mock PDF download functionality
    console.log("[v0] Downloading PDF report for call history")
    alert("PDF report downloaded successfully!")
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Follow Up":
        return "bg-yellow-100 text-yellow-800"
      case "Not Interested":
        return "bg-red-100 text-red-800"
      case "No Response":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-blue-100 text-blue-800"
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
                {dateRange}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Select Date Range</DialogTitle>
              </DialogHeader>
              <div className="p-4">
                <div className="grid grid-cols-7 gap-2 mb-4">
                  {/* Mock calendar - simplified for demo */}
                  {Array.from({ length: 31 }, (_, i) => (
                    <button
                      key={i}
                      className="p-2 text-sm hover:bg-teal-100 rounded"
                      onClick={() => {
                        setDateRange(`Jan ${i + 1} - Jan ${Math.min(i + 7, 31)}`)
                        setIsCalendarOpen(false)
                      }}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            onClick={handleDownloadPDF}
            className="bg-teal-500 hover:bg-teal-600 text-white flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
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
            <p className="text-xs text-gray-500">{dateRange}</p>
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
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select Campaign" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Campaigns</SelectItem>
            <SelectItem value="q1">Q1 Leads</SelectItem>
            <SelectItem value="q3-instagram">Q3 Instagram Leads</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedFilter} onValueChange={setSelectedFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="follow-up">Follow Up</SelectItem>
            <SelectItem value="not-interested">Not Interested</SelectItem>
            <SelectItem value="no-response">No Response</SelectItem>
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
                        <div className="text-sm text-gray-500">{call.phone}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{call.dateTime}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{call.campaign}</td>
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
