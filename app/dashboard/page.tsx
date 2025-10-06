"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import dynamic from "next/dynamic"
const AgentPerformanceChart = dynamic(
  () => import("@/components/agent-performance-chart").then((m) => m.AgentPerformanceChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-pulse h-40 w-full bg-gray-200 rounded"></div>
      </div>
    ),
  }
)
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import type { User } from '@supabase/supabase-js'
// Fallback for environments where RealtimeChannel type isn't exported
type RealtimeChannel = any

// Type definitions for our data structures
interface Call {
  id: string
  user_id: string
  customer_name: string
  customer_phone: string
  call_type: 'inbound' | 'outbound'
  status: 'completed' | 'missed' | 'in_progress'
  duration?: number
  notes?: string
  created_at: string
  updated_at: string
}

interface Campaign {
  id: string
  user_id: string
  name: string
  description?: string
  status: string
  target_contacts?: number
  completed_calls?: number
  success_rate?: number
  created_at: string
  updated_at: string
}

interface CallHistory {
  id: string
  user_id: string
  campaign_id?: string
  contact_id?: string
  phone_number: string
  status: string
  duration?: number
  cost?: number
  notes?: string
  ai_summary?: string
  sentiment?: string
  call_date: string
  created_at: string
}

interface CallStats {
  inbound: {
    resolved: number
    notResolved: number
    forwarded: number
  }
  outbound: {
    followUp: number
    notInterested: number
    notAnswered: number
  }
}

interface CallMetrics {
  totalMinutes: number
  remainingMinutes: number
  percentRemaining: number
  avgDuration: number
  avgChangePercent: number
}

interface FormattedCall {
  status: string
  contact: string
  dateTime: string
  statusColor: string
  summary: string
}

export default function Dashboard() {
  const [callType, setCallType] = useState<'inbound' | 'outbound'>("inbound")
  const [selectedCall, setSelectedCall] = useState<FormattedCall | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [callStats, setCallStats] = useState<CallStats>({
    inbound: { resolved: 0, notResolved: 0, forwarded: 0 },
    outbound: { followUp: 0, notInterested: 0, notAnswered: 0 }
  })
  const [callMetrics, setCallMetrics] = useState<CallMetrics>({
    totalMinutes: 0,
    remainingMinutes: 0,
    percentRemaining: 0,
    avgDuration: 0,
    avgChangePercent: 0
  })
  const [talkingPoints, setTalkingPoints] = useState<{ label: string; percent: number; color: string; hexColor?: string }[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null

    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          // Middleware guards routes; avoid client redirects to prevent loops.
          // Also stop the spinner if the user isn't authenticated.
          setLoading(false)
          return
        }
        setUser(user)
        setCurrentUserId(user.id)
        await fetchData(user.id)

        // Replace realtime subscription with periodic polling for Vapi data
        pollInterval = setInterval(() => {
          if (user.id) {
            fetchData(user.id)
          }
        }, 30000) // Poll every 30 seconds
      } catch (error) {
        console.error("Dashboard initialization error:", error)
      } finally {
        setLoading(false)
      }
    }
    
    init()
    
    return () => {
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [router, supabase])

  // Helper function to map Vapi call status to our internal status
  const mapVapiStatus = (vapiStatus: string): 'completed' | 'missed' | 'in_progress' => {
    switch (vapiStatus?.toLowerCase()) {
      case 'ended':
        return 'completed'
      case 'queued':
      case 'ringing':
      case 'in-progress':
      case 'forwarding':
        return 'in_progress'
      default:
        return 'missed'
    }
  }

  // Helper function to transform Vapi calls to our Call interface
  const transformVapiCalls = (vapiCalls: any[]): Call[] => {
    console.log('Transforming Vapi calls:', vapiCalls.length)
    return vapiCalls.slice(0, 10).map((vapiCall: any) => {
      console.log('Processing call:', vapiCall.id, 'Status:', vapiCall.status)
      return {
        id: vapiCall.id || '',
        user_id: 'vapi', // Not applicable for Vapi calls
        customer_name: vapiCall.customer?.name || vapiCall.customerName || 'Unknown',
        customer_phone: vapiCall.customer?.number || vapiCall.phoneNumber || vapiCall.toNumber || '',
        call_type: vapiCall.type === 'inbound' ? 'inbound' : 'outbound', // Use actual call type
        status: mapVapiStatus(vapiCall.status),
        duration: vapiCall.duration || 0,
        notes: vapiCall.summary || vapiCall.transcript || '',
        created_at: vapiCall.createdAt || vapiCall.startedAt || new Date().toISOString(),
        updated_at: vapiCall.updatedAt || vapiCall.endedAt || new Date().toISOString()
      }
    })
  }

  // Helper function to calculate call stats from Vapi calls
  const calculateCallStatsFromVapi = (vapiCalls: any[]) => {
    const outboundCalls = vapiCalls.filter(call => call.type !== 'inbound') // Most Vapi calls are outbound
    const inboundCalls = vapiCalls.filter(call => call.type === 'inbound')

    const outboundStatuses = outboundCalls.map(call => mapVapiStatus(call.status))
    const inboundStatuses = inboundCalls.map(call => mapVapiStatus(call.status))

    const stats: CallStats = {
      inbound: {
        resolved: inboundStatuses.filter(s => s === 'completed').length,
        notResolved: inboundStatuses.filter(s => s === 'missed').length,
        forwarded: inboundStatuses.filter(s => s === 'in_progress').length
      },
      outbound: {
        followUp: outboundStatuses.filter(s => s === 'completed').length,
        notInterested: outboundStatuses.filter(s => s === 'missed').length,
        notAnswered: outboundStatuses.filter(s => s === 'in_progress').length
      }
    }
    setCallStats(stats)
  }

  // Helper function to calculate call metrics from Vapi calls
  const calculateCallMetricsFromVapi = (vapiCalls: any[]) => {
    const totalPackageMinutes = 5000
    const usedMinutes = vapiCalls.reduce((total: number, call) => {
      const duration = call.duration || 0
      return total + (duration / 60) // Convert seconds to minutes
    }, 0)
    
    const remaining = Math.max(0, totalPackageMinutes - usedMinutes)
    const percentRemaining = Math.round((remaining / totalPackageMinutes) * 100)
    const totalCalls = vapiCalls.length || 1
    const avgDuration = vapiCalls.length ? Math.round((usedMinutes / totalCalls) * 10) / 10 : 0
    const avgChangePercent = 12

    setCallMetrics({
      totalMinutes: totalPackageMinutes,
      remainingMinutes: Math.round(remaining),
      percentRemaining,
      avgDuration,
      avgChangePercent
    })
  }

  // Helper function to extract talking points from Vapi call analysis data
  const calculateTalkingPointsFromVapi = (vapiCalls: any[]) => {
    console.log('Calculating talking points from', vapiCalls.length, 'calls')
    const talkingPointsMap = new Map<string, number>()
    
    // Extract talking points from each call's data section
    vapiCalls.forEach((call, index) => {
      console.log(`Call ${index + 1}:`, call.id)
      
      // Check multiple possible locations for the data
      const data = call.data || call.analysis || call.analysisData
      console.log('Data found:', !!data)
      
      if (data && data.talking_points && Array.isArray(data.talking_points)) {
        console.log('Talking points found:', data.talking_points.length)
        data.talking_points.forEach((tp: any) => {
          const name = tp.talking_point_name || tp.name || tp.label
          console.log('Processing talking point:', name)
          
          // Accept any talking point name, including "Undetermined"
          if (name) {
            talkingPointsMap.set(name, (talkingPointsMap.get(name) || 0) + 1)
          }
        })
      } else {
        console.log('No talking points found in call', call.id)
      }
    })

    console.log('Final talking points map:', Array.from(talkingPointsMap.entries()))

    if (talkingPointsMap.size === 0) {
      console.log('No talking points found, setting empty array')
      setTalkingPoints([])
      return
    }

    // Convert to array and sort by frequency
    const sortedPoints = Array.from(talkingPointsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6) // Take top 6 talking points

    // Calculate total for percentage calculation
    const total = sortedPoints.reduce((sum, [, count]) => sum + count, 0)
    
    // Define unique colors for each category
    const colors = [
      "#14b8a6", // teal
      "#3b82f6", // blue
      "#f59e0b", // amber
      "#ef4444", // red
      "#8b5cf6", // violet
      "#06b6d4", // cyan
    ]

    // Create talking points with colors and percentages
    const points = sortedPoints.map(([name, count], index) => ({
      label: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
      percent: Math.round((count / total) * 100),
      color: `bg-[${colors[index % colors.length]}]`,
      hexColor: colors[index % colors.length]
    }))

    console.log('Final talking points:', points)
    setTalkingPoints(points)
  }

  const fetchData = async (uid?: string) => {
    try {
      // Resolve user id if not provided
      let userId = uid
      if (!userId) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        userId = user.id
      }

      // Resolve owners set: self + any owners where I'm a member (active)
      const owners: string[] = [userId]
      const { data: memberships } = await supabase
        .from("account_users")
        .select("owner_user_id, is_active")
        .eq("member_user_id", userId)
        .eq("is_active", true)
      ;(memberships || []).forEach((m: any) => {
        const oid = String(m?.owner_user_id || "")
        if (oid && !owners.includes(oid)) owners.push(oid)
      })

      // Use Promise.allSettled for parallel requests
      const results = await Promise.allSettled([
        // NEW: Fetch calls from Vapi API
        fetch('/api/vapi/calls').then(res => res.json()),
        
        // KEEP: Fetch campaigns from Supabase
        supabase
          .from("campaigns")
          .select("id, name, status, target_contacts, completed_calls, success_rate, created_at")
          .in("user_id", owners)
          .order("created_at", { ascending: false })
          .limit(50),
        
        // SKIP: talking points events (as requested)
        Promise.resolve({ data: [] })
      ])

      // Handle Vapi calls data
      if (results[0].status === 'fulfilled' && results[0].value.success) {
        const vapiCalls = results[0].value.data || []
        console.log('Vapi calls received:', vapiCalls.length)
        
        // Transform and set calls data
        setCalls(transformVapiCalls(vapiCalls))
        
        // Calculate stats and metrics from Vapi data
        calculateCallStatsFromVapi(vapiCalls)
        calculateCallMetricsFromVapi(vapiCalls)
        
        // Calculate talking points from Vapi analysis data
        calculateTalkingPointsFromVapi(vapiCalls)
      } else if (results[0].status === 'fulfilled') {
        console.error('Vapi API error:', results[0].value.error)
        // Set empty data on API error
        setCalls([])
        setCallStats({
          inbound: { resolved: 0, notResolved: 0, forwarded: 0 },
          outbound: { followUp: 0, notInterested: 0, notAnswered: 0 }
        })
        setCallMetrics({
          totalMinutes: 5000,
          remainingMinutes: 5000,
          percentRemaining: 100,
          avgDuration: 0,
          avgChangePercent: 0
        })
        setTalkingPoints([])
      }

      // Handle campaigns (keep existing Supabase logic)
      if (results[1].status === 'fulfilled' && !results[1].value.error) {
        setCampaigns((results[1].value.data as Campaign[]) || [])
      }

      // Log any failed requests
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`API request ${index + 1} failed:`, result.reason)
        }
      })

    } catch (error) {
      console.error("Error fetching data:", error)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/auth")
  }

  // Calculate call statistics from calls data
  const calculateCallStats = (inboundStatuses: string[], outboundStatuses: string[]) => {
    const stats: CallStats = {
      inbound: {
        resolved: inboundStatuses.filter(s => s === 'completed').length,
        notResolved: inboundStatuses.filter(s => s === 'missed').length,
        forwarded: inboundStatuses.filter(s => s === 'in_progress').length
      },
      outbound: {
        followUp: outboundStatuses.filter(s => s === 'completed').length,
        notInterested: outboundStatuses.filter(s => s === 'in_progress').length,
        notAnswered: outboundStatuses.filter(s => s === 'missed').length
      }
    }
    setCallStats(stats)
  }
  
  // Calculate call metrics
  const calculateCallMetrics = (callHistoryData: CallHistory[]) => {
    const totalPackageMinutes = 5000
    const usedMinutes = callHistoryData.reduce((total: number, call) => total + (call.duration || 0), 0) / 60
    const remaining = Math.max(0, totalPackageMinutes - usedMinutes)
    const percentRemaining = Math.round((remaining / totalPackageMinutes) * 100)
    const totalCalls = callHistoryData.length || 1
    const avgDuration = callHistoryData.length ? Math.round((usedMinutes / totalCalls) * 10) / 10 : 0
    const avgChangePercent = 12
    setCallMetrics({
      totalMinutes: totalPackageMinutes,
      remainingMinutes: Math.round(remaining),
      percentRemaining,
      avgDuration,
      avgChangePercent
    })
  }

  // Calculate talking points from talking_points_events table
  const calculateTalkingPointsFromEvents = (talkingPointsEvents: any[]) => {
    if (!talkingPointsEvents || talkingPointsEvents.length === 0) {
      setTalkingPoints([])
      return
    }

    // Count occurrences of each talking point text
    const textFrequency = new Map<string, number>()
    talkingPointsEvents.forEach(event => {
      if (event.text) {
        const text = event.text.trim()
        textFrequency.set(text, (textFrequency.get(text) || 0) + 1)
      }
    })

    // Convert to array and sort by frequency
    const sortedPoints = Array.from(textFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6) // Take top 6 talking points

    if (sortedPoints.length === 0) {
      setTalkingPoints([])
      return
    }

    // Calculate total for percentage calculation
    const total = sortedPoints.reduce((sum, [, count]) => sum + count, 0)
    
    // Define unique colors for each category
    const colors = [
      "#14b8a6", // teal
      "#3b82f6", // blue
      "#f59e0b", // amber
      "#ef4444", // red
      "#8b5cf6", // violet
      "#06b6d4", // cyan
    ]

    // Create talking points with colors and percentages
    const points = sortedPoints.map(([text, count], index) => ({
      label: text.charAt(0).toUpperCase() + text.slice(1).toLowerCase(),
      percent: Math.round((count / total) * 100),
      color: `bg-[${colors[index % colors.length]}]`, // Use arbitrary values for Tailwind
      hexColor: colors[index % colors.length] // Store hex color for chart
    }))

    setTalkingPoints(points)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  // Derived totals and percentages for circular charts
  const inboundTotal = callStats.inbound.resolved + callStats.inbound.notResolved + callStats.inbound.forwarded
  const outboundTotal = callStats.outbound.followUp + callStats.outbound.notInterested + callStats.outbound.notAnswered

  const inResolvedPct = inboundTotal ? Math.round((callStats.inbound.resolved / inboundTotal) * 100) : 0
  const inNotResolvedPct = inboundTotal ? Math.round((callStats.inbound.notResolved / inboundTotal) * 100) : 0
  const inForwardedPct = inboundTotal ? Math.round((callStats.inbound.forwarded / inboundTotal) * 100) : 0

  const outFollowUpPct = outboundTotal ? Math.round((callStats.outbound.followUp / outboundTotal) * 100) : 0
  const outNotInterestedPct = outboundTotal ? Math.round((callStats.outbound.notInterested / outboundTotal) * 100) : 0
  const outNotAnsweredPct = outboundTotal ? Math.round((callStats.outbound.notAnswered / outboundTotal) * 100) : 0

  // Format call data for display
  const recentCalls: Record<'inbound' | 'outbound', FormattedCall[]> = {
    inbound: calls
      .filter((call) => call.call_type === "inbound")
      .slice(0, 3)
      .map((call) => ({
        status: call.status === "completed" ? "Resolved" : call.status === "missed" ? "Not Resolved" : "In Progress",
        contact: call.customer_phone,
        dateTime: new Date(call.created_at).toLocaleString(),
        statusColor:
          call.status === "completed" ? "bg-green-500" : call.status === "missed" ? "bg-red-500" : "bg-yellow-500",
        summary: call.notes || "No summary available",
      })),
    outbound: calls
      .filter((call) => call.call_type === "outbound")
      .slice(0, 3)
      .map((call) => ({
        status: call.status === "completed" ? "Follow Up" : call.status === "missed" ? "Not Answered" : "In Progress",
        contact: call.customer_phone,
        dateTime: new Date(call.created_at).toLocaleString(),
        statusColor:
          call.status === "completed" ? "bg-teal-500" : call.status === "missed" ? "bg-orange-500" : "bg-gray-500",
        summary: call.notes || "No summary available",
      }))
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl text-black text-justify font-black">Dashboard</h1>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(currentUserId || undefined)}
            className="border-gray-200 text-black hover:bg-gray-50"
          >
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-10 h-10 bg-teal-500 rounded-full flex items-center justify-center hover:bg-teal-600"
              >
                <span className="text-white font-medium">{user?.email?.charAt(0).toUpperCase() || "A"}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem className="cursor-pointer">
                User Settings
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer text-red-600" onClick={handleLogout}>
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Remaining Minutes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl font-bold text-black">{callMetrics.remainingMinutes.toLocaleString()}</span>
              <Button size="sm" className="bg-teal-500 hover:bg-teal-600 text-white">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-teal-500 h-2 rounded-full"
                style={{ width: `${callMetrics.percentRemaining}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-500 mt-1">{callMetrics.percentRemaining}% remaining</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-gray-600">Outbound Calls</CardTitle>
            <Select defaultValue="1week">
              <SelectTrigger className="w-20 h-6 text-xs border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="1month">1 Month</SelectItem>
                <SelectItem value="1week">1 Week</SelectItem>
                <SelectItem value="today">Today</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-20">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="2" />
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#14b8a6" strokeWidth="2" strokeDasharray={`${outFollowUpPct}, 100`} />
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray={`${outNotInterestedPct}, 100`} strokeDashoffset={`-${outFollowUpPct}`} />
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray={`${outNotAnsweredPct}, 100`} strokeDashoffset={`-${outFollowUpPct + outNotInterestedPct}`} />
                </svg>
              </div>
            </div>
            <div className="text-xs space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                  <span>Follow Up</span>
                </div>
                <span>{outFollowUpPct}%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span>Not Interested</span>
                </div>
                <span>{outNotInterestedPct}%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span>Not Answered</span>
                </div>
                <span>{outNotAnsweredPct}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-gray-600">Inbound Calls</CardTitle>
            <Select defaultValue="1week">
              <SelectTrigger className="w-20 h-6 text-xs border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="1month">1 Month</SelectItem>
                <SelectItem value="1week">1 Week</SelectItem>
                <SelectItem value="today">Today</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-20">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="2" />
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray={`${inResolvedPct}, 100`} />
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray={`${inNotResolvedPct}, 100`} strokeDashoffset={`-${inResolvedPct}`} />
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray={`${inForwardedPct}, 100`} strokeDashoffset={`-${inResolvedPct + inNotResolvedPct}`} />
                </svg>
              </div>
            </div>
            <div className="text-xs space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Resolved</span>
                </div>
                <span>{inResolvedPct}%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span>Not Resolved</span>
                </div>
                <span>{inNotResolvedPct}%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span>Forwarded</span>
                </div>
                <span>{inForwardedPct}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-gray-600">Average Call Duration</CardTitle>
            <Select defaultValue="inbound">
              <SelectTrigger className="w-20 h-6 text-xs border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inbound">Inbound</SelectItem>
                <SelectItem value="outbound">Outbound</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <span className="text-3xl font-bold text-black">{callMetrics.avgDuration}</span>
              <p className="text-sm text-gray-500">minutes</p>
                          </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-medium text-black">Number of Calls</CardTitle>
            <Select defaultValue="weekly">
              <SelectTrigger className="w-24 border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <AgentPerformanceChart calls={calls} />
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-medium text-black">Customer Talking Points</CardTitle>
            <Select defaultValue="inbound">
              <SelectTrigger className="w-24 border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inbound">Inbound</SelectItem>
                <SelectItem value="outbound">Outbound</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={talkingPoints.map((tp) => ({ name: tp.label, value: tp.percent }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                  >
                    {talkingPoints.map((tp, idx) => {
                      const hexColors = ["#14b8a6", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"]
                      return <Cell key={idx} fill={tp.hexColor || hexColors[idx % hexColors.length]} />
                    })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mt-4">
              {talkingPoints.length === 0 ? (
                <div className="text-gray-500 col-span-2">Not enough data</div>
              ) : (
                talkingPoints.map((tp, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tp.hexColor || ["#14b8a6", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"][idx % 6] }}
                    ></div>
                    <span>{tp.label} ({tp.percent}%)</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Calls Table */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-medium text-black">Recent Calls</CardTitle>
          <div className="flex items-center gap-4">
            <Tabs
              value={callType}
              onValueChange={(value: string) => setCallType(value as 'inbound' | 'outbound')}
              className="w-auto"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="inbound">Inbound</TabsTrigger>
                <TabsTrigger value="outbound">Outbound</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" className="border-gray-200 text-black hover:bg-gray-50 bg-transparent">
              Filter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-black font-medium">Status</TableHead>
                <TableHead className="text-black font-medium">Contact</TableHead>
                <TableHead className="text-black font-medium">Date And Time</TableHead>
                <TableHead className="text-black font-medium">View Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentCalls[callType]?.map((call: FormattedCall, index: number) => (
                <TableRow key={index} className="hover:bg-gray-50">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${call.statusColor}`} />
                      <Badge
                        variant="outline"
                        className={
                          call.status === "Resolved" || call.status === "Follow Up"
                            ? "bg-green-100 text-green-700 border-green-200"
                            : call.status === "Not Resolved" || call.status === "Not Interested"
                              ? "bg-red-100 text-red-700 border-red-200"
                              : call.status === "Forwarded"
                                ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                                : "bg-orange-100 text-orange-700 border-orange-200"
                        }
                      >
                        {call.status}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-black font-mono">{call.contact}</TableCell>
                  <TableCell className="text-black">{call.dateTime}</TableCell>
                  <TableCell>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-teal-600 hover:text-teal-700 hover:bg-teal-50"
                          onClick={() => setSelectedCall(call)}
                        >
                          View
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md" aria-describedby="call-summary-desc">
                        <DialogHeader>
                          <DialogTitle>Call Summary</DialogTitle>
                        </DialogHeader>
                        <div className="sr-only" id="call-summary-desc">
                          Detailed information about the selected call including contact, status, date/time, and summary.
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-medium text-gray-600">Contact:</label>
                            <p className="font-mono">{call.contact}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-600">Status:</label>
                            <p>{call.status}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-600">Date & Time:</label>
                            <p>{call.dateTime}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-600">Summary:</label>
                            <p className="text-sm text-gray-700 leading-relaxed">{call.summary}</p>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
