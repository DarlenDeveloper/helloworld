"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Filter, LogOut, Plus, Eye, UserIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
import type { RealtimeChannel } from '@supabase/supabase-js'

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
  const [orgId, setOrgId] = useState<string | null>(null)
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
  const [talkingPoints, setTalkingPoints] = useState<{ label: string; percent: number; color: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [needsOrg, setNeedsOrg] = useState(false)
  const [orgCreateName, setOrgCreateName] = useState("")
  const [orgCreating, setOrgCreating] = useState(false)
  const [orgError, setOrgError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/login")
        return
      }
      setUser(user)
      // Resolve organization membership
      const { data: membershipRows } = await supabase
        .from('organization_members')
        .select('organization_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)

      const membership = (membershipRows || [])[0] as { organization_id: string } | undefined
      if (!membership) {
        // Attempt to auto-recover membership before asking user to create an organization
        const attached = await ensureMembership(user)
        if (!attached) {
          setNeedsOrg(true)
          setLoading(false)
          return
        }
        setOrgId(attached)
        await fetchData(attached)
        setLoading(false)
        return
      }
      setOrgId(membership.organization_id)
      await fetchData(membership.organization_id)
      setLoading(false)
    }

    checkAuth()
  }, [router, supabase])

  const fetchData = async (orgId: string) => {
    try {
      // Fetch calls with real-time subscription
      const { data: callsData, error: callsError } = await supabase
        .from("calls")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(10)

      if (callsError) {
        console.error("Error fetching calls:", callsError)
      } else {
        setCalls(callsData as Call[] || [])
        calculateCallStats(callsData as Call[] || [])
      }

      // Set up real-time subscription for calls
      const callsSubscription: RealtimeChannel = supabase
        .channel('calls-changes')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'calls', filter: `organization_id=eq.${orgId}` },
          (payload) => {
            console.log('Calls change received!', payload)
            fetchData(orgId)
          }
        )
        .subscribe()

      // Fetch campaigns
      const { data: campaignsData, error: campaignsError } = await supabase
        .from("campaigns")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })

      if (campaignsError) {
        console.error("Error fetching campaigns:", campaignsError)
      } else {
        setCampaigns(campaignsData as Campaign[] || [])
      }
      
      // Fetch call metrics
      const { data: callHistoryData, error: callHistoryError } = await supabase
        .from("call_history")
        .select("*")
        .eq("organization_id", orgId)
        
      if (callHistoryError) {
        console.error("Error fetching call history:", callHistoryError)
      } else {
        calculateCallMetrics(callHistoryData as CallHistory[] || [])
        calculateTalkingPoints(callHistoryData as CallHistory[] || [])
      }

      return () => {
        supabase.removeChannel(callsSubscription)
      }
    } catch (error) {
      console.error("Error fetching data:", error)
    }
  }

  // Try to ensure the user has a membership by linking to an existing org they own or via account_emails
  const ensureMembership = async (u: User): Promise<string | null> => {
    try {
      // 1) If user created an organization (created_by), attach as first/admin member if needed
      const { data: orgRows } = await supabase
        .from('organizations')
        .select('id')
        .eq('created_by', u.id)
        .order('created_at', { ascending: true })
        .limit(1)
      const ownOrg = (orgRows || [])[0] as { id: string } | undefined
      const roleMeta = (u.user_metadata?.role as string) || 'admin'
      const safeRole = ['admin','manager','agent','viewer'].includes(roleMeta) ? roleMeta : 'admin'

      if (ownOrg?.id) {
        // attempt insert membership (allowed by policy for first member)
        await supabase
          .from('organization_members')
          .insert({ organization_id: ownOrg.id, user_id: u.id, role: safeRole as any })
          .select('organization_id')
        // re-check membership
        const { data: membershipRows } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', u.id)
          .order('created_at', { ascending: true })
          .limit(1)
        const m = (membershipRows || [])[0] as { organization_id: string } | undefined
        if (m?.organization_id) return m.organization_id
      }

      // 2) If admin added this user's email in account_emails, attempt to join that org
      const userEmail = (u.email || '').toLowerCase()
      if (userEmail) {
        const { data: emailRows } = await supabase
          .from('account_emails')
          .select('organization_id')
          .eq('email', userEmail)
          .order('created_at', { ascending: true })
          .limit(1)
        const emailOrg = (emailRows || [])[0] as { organization_id: string } | undefined
        if (emailOrg?.organization_id) {
          await supabase
            .from('organization_members')
            .insert({ organization_id: emailOrg.organization_id, user_id: u.id, role: 'agent' as any })
            .select('organization_id')
          const { data: membershipRows2 } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', u.id)
            .order('created_at', { ascending: true })
            .limit(1)
          const m2 = (membershipRows2 || [])[0] as { organization_id: string } | undefined
          if (m2?.organization_id) return m2.organization_id
        }
      }
    } catch (e) {
      console.error('ensureMembership failed:', e)
    }
    return null
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  // Calculate call statistics from calls data
  const calculateCallStats = (callsData: Call[]) => {
    // Count calls by type and status
    const inboundCalls = callsData.filter(call => call.call_type === 'inbound')
    const outboundCalls = callsData.filter(call => call.call_type === 'outbound')
    
    const inboundTotal = inboundCalls.length || 1 // Avoid division by zero
    const outboundTotal = outboundCalls.length || 1
    
    const stats: CallStats = {
      inbound: {
        resolved: inboundCalls.filter(call => call.status === 'completed').length,
        notResolved: inboundCalls.filter(call => call.status === 'missed').length,
        forwarded: inboundCalls.filter(call => call.status === 'in_progress').length
      },
      outbound: {
        followUp: outboundCalls.filter(call => call.status === 'completed').length,
        notInterested: outboundCalls.filter(call => call.status === 'in_progress').length,
        notAnswered: outboundCalls.filter(call => call.status === 'missed').length
      }
    }
    
    setCallStats(stats)
  }
  
  // Calculate call metrics
  const calculateCallMetrics = (callHistoryData: CallHistory[]) => {
    // Example calculation for remaining minutes (assuming a total package of 5000 minutes)
    const totalPackageMinutes = 5000
    const usedMinutes = callHistoryData.reduce((total: number, call) => total + (call.duration || 0), 0) / 60
    const remaining = Math.max(0, totalPackageMinutes - usedMinutes)
    const percentRemaining = Math.round((remaining / totalPackageMinutes) * 100)
    
    // Calculate average call duration
    const totalCalls = callHistoryData.length || 1
    const avgDuration = callHistoryData.length ? Math.round((usedMinutes / totalCalls) * 10) / 10 : 0
    
    // For demo purposes, simulate change percentage
    const avgChangePercent = 12 // +12% from last week
    
    setCallMetrics({
      totalMinutes: totalPackageMinutes,
      remainingMinutes: Math.round(remaining),
      percentRemaining,
      avgDuration,
      avgChangePercent
    })
  }

  // Derive top talking points from call summaries/notes
  const calculateTalkingPoints = (callHistoryData: CallHistory[]) => {
    const text = callHistoryData
      .map((c) => (c.ai_summary || c.notes || ""))
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
    const colors = ["bg-teal-500", "bg-blue-500", "bg-yellow-500", "bg-red-500"]

    const points = top.map(([label, n], i) => ({
      label: label.replace(/\b\w/g, (c) => c.toUpperCase()),
      percent: Math.round((n / totalTop) * 100),
      color: colors[i] || "bg-gray-400",
    }))

    setTalkingPoints(points)
  }
  
  const handleCreateOrganization = async () => {
    setOrgError(null)
    if (!orgCreateName.trim()) {
      setOrgError("Organization name is required")
      return
    }
    setOrgCreating(true)
    try {
      await supabase.rpc('create_organization', { p_name: orgCreateName.trim() })
      // Resolve membership again
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: membershipRows } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
      const membership = (membershipRows || [])[0] as { organization_id: string } | undefined
      if (membership) {
        setOrgId(membership.organization_id)
        setNeedsOrg(false)
        await fetchData(membership.organization_id)
      }
    } catch (e) {
      console.error(e)
      setOrgError("Failed to create organization. Please try again.")
    } finally {
      setOrgCreating(false)
    }
  }

  if (needsOrg) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Create Your Organization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Enter your organization name to get started.</p>
              <Input
                placeholder="Organization Name"
                value={orgCreateName}
                onChange={(e) => setOrgCreateName(e.target.value)}
              />
              {orgError && <p className="text-sm text-red-600">{orgError}</p>}
              <div className="flex justify-end">
                <Button onClick={handleCreateOrganization} disabled={orgCreating} className="bg-teal-500 hover:bg-teal-600">
                  {orgCreating ? "Creating..." : "Create Organization"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
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
    <div className="p-6 ml-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl text-black text-justify font-black">Dashboard</h1>
        <div className="flex items-center gap-4">
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
                <UserIcon className="h-4 w-4 mr-2" />
                User Settings
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer text-red-600" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
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
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="2"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#14b8a6"
                    strokeWidth="2"
                    strokeDasharray="45, 100"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeDasharray="30, 100"
                    strokeDashoffset="-45"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2"
                    strokeDasharray="25, 100"
                    strokeDashoffset="-75"
                  />
                </svg>
              </div>
            </div>
            <div className="text-xs space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                  <span>Follow Up</span>
                </div>
                <span>{Math.round((callStats.outbound.followUp / (calls.filter((c: Call) => c.call_type === "outbound").length || 1)) * 100)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span>Not Interested</span>
                </div>
                <span>{Math.round((callStats.outbound.notInterested / (calls.filter((c: Call) => c.call_type === "outbound").length || 1)) * 100)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span>Not Answered</span>
                </div>
                <span>{Math.round((callStats.outbound.notAnswered / (calls.filter((c: Call) => c.call_type === "outbound").length || 1)) * 100)}%</span>
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
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="2"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    strokeDasharray="60, 100"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2"
                    strokeDasharray="25, 100"
                    strokeDashoffset="-60"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeDasharray="15, 100"
                    strokeDashoffset="-85"
                  />
                </svg>
              </div>
            </div>
            <div className="text-xs space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Resolved</span>
                </div>
                <span>{Math.round((callStats.inbound.resolved / (calls.filter((c: Call) => c.call_type === "inbound").length || 1)) * 100)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span>Not Resolved</span>
                </div>
                <span>{Math.round((callStats.inbound.notResolved / (calls.filter((c: Call) => c.call_type === "inbound").length || 1)) * 100)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span>Forwarded</span>
                </div>
                <span>{Math.round((callStats.inbound.forwarded / (calls.filter((c: Call) => c.call_type === "inbound").length || 1)) * 100)}%</span>
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
              <div className="mt-2 text-xs text-teal-600">+{callMetrics.avgChangePercent}% from last week</div>
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
            <AgentPerformanceChart />
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
                    {talkingPoints.map((_, idx) => {
                      const hexColors = ["#14b8a6", "#3b82f6", "#f59e0b", "#ef4444"]
                      return <Cell key={idx} fill={hexColors[idx % hexColors.length]} />
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
                    <div className={`w-3 h-3 ${tp.color} rounded-full`}></div>
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
              <Filter className="h-4 w-4 mr-2" />
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
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Call Summary</DialogTitle>
                        </DialogHeader>
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
