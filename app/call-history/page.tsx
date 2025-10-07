"use client"

import { useState, useEffect, useRef } from "react"
import { Calendar, Search, Phone, Clock, Download, Filter, ArrowUpDown, PhoneCall, PhoneIncoming, PhoneOutgoing, Timer, User, FileText, RefreshCw, FileSpreadsheet } from "lucide-react"
import { DayPicker } from "react-day-picker"
import type { DateRange } from "react-day-picker"
import "react-day-picker/dist/style.css"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"

interface VapiCall {
  id: string
  type: string
  status: string
  customer?: { name?: string; number?: string }
  customerName?: string
  phoneNumber?: string
  toNumber?: string
  duration?: number
  durationSec?: number
  durationMs?: number
  summary?: string
  transcript?: string
  createdAt?: string
  startedAt?: string
  endedAt?: string
  updatedAt?: string
}

interface FormattedCall {
  id: string
  status: string
  contact: string
  phoneNumber: string
  dateTime: string
  timestamp: number
  statusColor: string
  summary: string
  duration: number
  callType: 'inbound' | 'outbound'
  callTypeIcon: any
  callTypeColor: string
}

export default function CallHistoryPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedFilter, setSelectedFilter] = useState("all")
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - 29) // Last 30 days for PDF
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return { from: start, to: end }
  })
  const [rangeLabel, setRangeLabel] = useState("Last 30 days")
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [callHistory, setCallHistory] = useState<FormattedCall[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

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

  // Set up auto refresh interval (5 minutes)
  const setupAutoRefresh = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => {
      fetchCallHistory()
    }, 300000) // 5 minutes
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setFetchError("User not authenticated")
        setLoading(false)
        return
      }

      await fetchCallHistory()
      setupAutoRefresh()
    }

    init()

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // Helper function to map Vapi call status to our internal status
  const mapVapiStatus = (vapiStatus: string): string => {
    switch (vapiStatus?.toLowerCase()) {
      case 'ended':
      case 'completed':
      case 'success':
        return 'Completed'
      case 'queued':
      case 'ringing':
      case 'in-progress':
      case 'forwarding':
        return 'In Progress'
      case 'failed':
      case 'busy':
        return 'Busy'
      case 'no-answer':
        return 'No Answer'
      case 'voicemail':
        return 'Voicemail'
      default:
        return 'Unknown'
    }
  }

  // Helper function to get call type info
  const getCallTypeInfo = (type: string) => {
    if (type === 'inboundPhoneCall' || type === 'inbound') {
      return {
        type: 'inbound' as const,
        icon: PhoneIncoming,
        color: 'text-purple-600 bg-purple-50',
        label: 'Inbound'
      }
    } else {
      return {
        type: 'outbound' as const,
        icon: PhoneOutgoing,
        color: 'text-green-600 bg-green-50',
        label: 'Outbound'
      }
    }
  }

  // Helper function to extract duration in seconds from Vapi call
  const extractDuration = (call: VapiCall): number => {
    let d: any = call?.duration ?? call?.durationSec
    if (typeof d === 'string') d = parseFloat(d)
    if (typeof d === 'number' && isFinite(d) && d > 0) return d

    let dm: any = call?.durationMs
    if (typeof dm === 'string') dm = parseFloat(dm)
    if (typeof dm === 'number' && isFinite(dm) && dm > 0) return dm / 1000

    const endStr = call?.endedAt || call?.updatedAt
    const startStr = call?.startedAt || call?.createdAt
    if (endStr && startStr) {
      const end = new Date(endStr).getTime()
      const start = new Date(startStr).getTime()
      const diff = (end - start) / 1000
      if (isFinite(diff) && diff > 0) return diff
    }
    return 0
  }

  const fetchCallHistory = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/vapi/calls')
      const result = await response.json()

      if (result.success && result.data) {
        const vapiCalls: VapiCall[] = result.data
        console.log('Vapi calls received:', vapiCalls.length)

        const formattedCalls: FormattedCall[] = vapiCalls.map((call: VapiCall) => {
          const callTypeInfo = getCallTypeInfo(call.type)
          const duration = extractDuration(call)
          const status = mapVapiStatus(call.status)
          const timestamp = new Date(call.createdAt || call.startedAt || Date.now())

          return {
            id: call.id,
            status,
            contact: call.customer?.name || call.customerName || 'Unknown',
            phoneNumber: call.customer?.number || call.phoneNumber || call.toNumber || '',
            dateTime: timestamp.toLocaleString(),
            timestamp: timestamp.getTime(),
            statusColor: getStatusBadgeColor(status),
            summary: call.summary || call.transcript || 'No summary available',
            duration,
            callType: callTypeInfo.type,
            callTypeIcon: callTypeInfo.icon,
            callTypeColor: callTypeInfo.color
          }
        })

        setCallHistory(formattedCalls)
        setFetchError(null)
      } else {
        console.error('Vapi API error:', result.error)
        setFetchError('Failed to fetch call history from Vapi API')
      }
    } catch (error) {
      console.error('Error fetching call history:', error)
      setFetchError('Failed to fetch call history. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadgeColor = (status: string): string => {
    switch (status) {
      case 'Completed':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'In Progress':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'Busy':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'No Answer':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      case 'Voicemail':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const handleRefresh = async () => {
    await fetchCallHistory()
    setupAutoRefresh()
  }

  // Filter data based on current filters
  const filteredData = callHistory.filter((call) => {
    const matchesSearch =
      call.contact?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.phoneNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.summary?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesFilter = selectedFilter === "all" || 
      call.status?.toLowerCase() === selectedFilter.toLowerCase()

    const matchesDate = (() => {
      if (!selectedRange?.from || !selectedRange?.to) return true
      const start = startOfDay(selectedRange.from).getTime()
      const end = endOfDay(selectedRange.to).getTime()
      return call.timestamp >= start && call.timestamp <= end
    })()

    return matchesSearch && matchesFilter && matchesDate
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

  // CSV download functionality
  const handleDownloadCSV = () => {
    try {
      // Filter data to last 30 days only
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      const csvData = filteredData
        .filter(call => call.timestamp >= thirtyDaysAgo.getTime())
        .map(call => ({
          'Call Type': call.callType === 'inbound' ? 'Inbound' : 'Outbound',
          'Status': call.status,
          'Contact': call.contact,
          'Phone Number': call.phoneNumber,
          'Duration (seconds)': call.duration,
          'Date & Time': call.dateTime,
          'Summary': call.summary.replace(/"/g, '""') // Escape quotes for CSV
        }))

      if (csvData.length === 0) {
        alert('No call data available for the last 30 days to export.')
        return
      }

      // Create CSV content
      const headers = Object.keys(csvData[0])
      const csvContent = [
        headers.join(','),
        ...csvData.map(row => 
          headers.map(header => `"${row[header as keyof typeof row]}"`).join(',')
        )
      ].join('\n')

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `call-history-${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      console.log(`CSV downloaded with ${csvData.length} calls from the last 30 days`)
    } catch (error) {
      console.error('Error downloading CSV:', error)
      alert('Error downloading CSV file. Please try again.')
    }
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
    <div className="ml-20 p-6 pr-8 bg-white min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Call History</h1>
          <p className="text-gray-600 mt-1">View and manage your call records from Vapi</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="border-gray-200 text-gray-700 hover:bg-gray-50"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Dialog open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 border-gray-200 text-gray-700 hover:bg-gray-50">
                <Calendar className="h-4 w-4" />
                {rangeLabel}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Select Date Range</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <div className="text-sm font-medium text-gray-700">Quick Presets</div>
                  <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
                    <Button variant="outline" className="justify-start bg-transparent hover:bg-teal-50 hover:text-teal-700" onClick={() => applyPreset('today')}>Today</Button>
                    <Button variant="outline" className="justify-start bg-transparent hover:bg-teal-50 hover:text-teal-700" onClick={() => applyPreset('last7')}>Last 7 days</Button>
                    <Button variant="outline" className="justify-start bg-transparent hover:bg-teal-50 hover:text-teal-700" onClick={() => applyPreset('thisMonth')}>This month</Button>
                    <Button variant="outline" className="justify-start bg-transparent hover:bg-teal-50 hover:text-teal-700" onClick={() => applyPreset('lastMonth')}>Last month</Button>
                    <Button variant="outline" className="justify-start bg-transparent hover:bg-teal-50 hover:text-teal-700" onClick={() => applyPreset('all')}>All time</Button>
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
                    className="border rounded-lg p-3"
                  />
                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" className="bg-transparent" onClick={() => { setSelectedRange(undefined); setRangeLabel('All time'); setIsCalendarOpen(false); }}>Clear</Button>
                    <Button onClick={applyRange} className="bg-teal-500 hover:bg-teal-600 text-white">Apply Range</Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            onClick={handleDownloadCSV}
            className="bg-teal-500 hover:bg-teal-600 text-white shadow-sm"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Download CSV
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
            className="pl-10 border-gray-200 focus:border-teal-500 focus:ring-teal-500"
          />
        </div>

        <Select value={selectedFilter} onValueChange={setSelectedFilter}>
          <SelectTrigger className="w-48 border-gray-200">
            <SelectValue placeholder="Filter by Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="in progress">In Progress</SelectItem>
            <SelectItem value="busy">Busy</SelectItem>
            <SelectItem value="no answer">No Answer</SelectItem>
            <SelectItem value="voicemail">Voicemail</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Call History Table */}
      <Card className="shadow-sm border-gray-200">
        <CardContent className="p-0">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-teal-500 mr-3" />
              <span className="text-gray-600">Loading call history...</span>
            </div>
          )}
          
          {fetchError && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-red-600 mb-2">{fetchError}</p>
                <Button onClick={handleRefresh} variant="outline" size="sm">
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {!loading && !fetchError && (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead className="font-semibold text-gray-700">Call Type</TableHead>
                  <TableHead className="font-semibold text-gray-700">Status</TableHead>
                  <TableHead className="font-semibold text-gray-700">Contact</TableHead>
                  <TableHead className="font-semibold text-gray-700">Duration</TableHead>
                  <TableHead className="font-semibold text-gray-700">Date & Time</TableHead>
                  <TableHead className="font-semibold text-gray-700">Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((call) => {
                  const CallTypeIcon = call.callTypeIcon
                  return (
                    <TableRow key={call.id} className="hover:bg-gray-50/50 transition-colors">
                      <TableCell className="py-4">
                        <Badge variant="outline" className={`${call.callTypeColor} border-current`}>
                          <CallTypeIcon className="h-3 w-3 mr-1" />
                          {call.callType === 'inbound' ? 'Inbound' : 'Outbound'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant="outline" className={call.statusColor}>
                          {call.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="space-y-1">
                          <div className="font-medium text-gray-900">
                            {call.contact}
                          </div>
                          {call.phoneNumber && (
                            <div className="text-sm text-gray-500 font-mono">
                              {call.phoneNumber}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center text-sm text-gray-600">
                          <Timer className="h-3 w-3 mr-1" />
                          {Math.round(call.duration)}s
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="text-sm text-gray-900">
                          {call.dateTime}
                        </div>
                      </TableCell>
                      <TableCell className="py-4 max-w-xs">
                        <div className="relative group">
                          <div className="truncate text-sm text-gray-700">
                            {call.summary}
                          </div>
                          {call.summary && call.summary !== 'No summary available' && (
                            <div className="absolute z-50 hidden group-hover:block bg-white border border-gray-200 shadow-lg rounded-lg p-4 w-96 max-w-[90vw] max-h-64 overflow-auto right-0 top-full mt-2">
                              <div className="flex items-center gap-2 mb-2">
                                <FileText className="h-4 w-4 text-teal-500" />
                                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                  Call Summary
                                </div>
                              </div>
                              <div className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">
                                {call.summary}
                              </div>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

          {!loading && !fetchError && filteredData.length === 0 && (
            <div className="text-center py-12">
              <Phone className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No calls found</h3>
              <p className="text-gray-500 mb-4">
                {searchTerm || selectedFilter !== 'all' 
                  ? 'Try adjusting your search or filters to find what you\'re looking for.'
                  : 'Your call history will appear here once you start making calls.'}
              </p>
              {(searchTerm || selectedFilter !== 'all') && (
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setSearchTerm('')
                    setSelectedFilter('all')
                  }}
                  className="border-gray-200"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
