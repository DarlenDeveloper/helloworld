"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Calendar, TrendingUp, Phone, Clock, DollarSign, Users, Activity, Target, Zap, BarChart3, PieChart as PieChartIcon, LineChart, TrendingDown, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart as RechartsLineChart, Line, AreaChart, Area, RadialBarChart, RadialBar, Legend } from "recharts"
import { VapiAnalyticsRequest } from "@/lib/api/vapi"
import { DayPicker } from "react-day-picker"
import type { DateRange } from "react-day-picker"
import "react-day-picker/dist/style.css"

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

interface VapiMetrics {
  totalCalls: number
  totalDuration: number
  totalCost: number
  concurrentCalls: number
  avgDuration: number
  successRate: number
  peakHour: string
  conversionRate: number
  customerSatisfaction: number
}

interface CallVolumeData {
  date: string
  calls: number
  duration: number
  cost: number
  success: number
}

interface CallOutcomeData {
  outcome: string
  count: number
  percentage: number
  color: string
}

interface HourlyData {
  hour: string
  calls: number
  success: number
}

interface GeographicData {
  region: string
  calls: number
  duration: number
  success: number
}

const STATUS_COLORS: Record<string, string> = {
  completed: "#10b981",
  missed: "#ef4444",
  "in-progress": "#f59e0b",
  ended: "#10b981",
  failed: "#ef4444",
}

// Professional color palette - green, black, and white theme
const OUTCOME_COLORS = [
  "#10b981", // green-500
  "#059669", // green-600  
  "#047857", // green-700
  "#065f46", // green-800
  "#064e3b", // green-900
  "#6b7280", // gray-500
  "#374151", // gray-700
  "#1f2937"  // gray-800
]

export default function AnalyticsPage() {
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - 29) // Last 30 days for analytics
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return { from: start, to: end }
  })
  const [rangeLabel, setRangeLabel] = useState("Last 30 days")
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [modalData, setModalData] = useState<any>(null)
  const [modalType, setModalType] = useState<"calls" | "status" | "talking">("calls")
  const [activeTab, setActiveTab] = useState("overview")
  const [loading, setLoading] = useState(true)
  const [realTimeEnabled, setRealTimeEnabled] = useState(true)

  // VAPI Analytics State with previous values for comparison
  const [vapiMetrics, setVapiMetrics] = useState<VapiMetrics>({
    totalCalls: 0,
    totalDuration: 0,
    totalCost: 0,
    concurrentCalls: 0,
    avgDuration: 0,
    successRate: 0,
    peakHour: "12:00 PM",
    conversionRate: 0,
    customerSatisfaction: 0
  })
  const [previousMetrics, setPreviousMetrics] = useState<VapiMetrics>({
    totalCalls: 0,
    totalDuration: 0,
    totalCost: 0,
    concurrentCalls: 0,
    avgDuration: 0,
    successRate: 0,
    peakHour: "12:00 PM",
    conversionRate: 0,
    customerSatisfaction: 0
  })
  const [callVolumeData, setCallVolumeData] = useState<CallVolumeData[]>([])
  const [callOutcomeData, setCallOutcomeData] = useState<CallOutcomeData[]>([])
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([])
  const [geographicData, setGeographicData] = useState<GeographicData[]>([])
  const [talkingPointsData, setTalkingPointsData] = useState<TalkingPointDatum[]>([])

  // Legacy state for backward compatibility
  const [callsData, setCallsData] = useState<{ date: string; fullDate: Date; dateLabel: string; calls: number }[]>([])
  const [followUpData, setFollowUpData] = useState<FollowUpDatum[]>([])

  // Animated Counter Component
  const AnimatedCounter = ({ value, duration = 2000, suffix = "" }: { value: number; duration?: number; suffix?: string }) => {
    const [displayValue, setDisplayValue] = useState(0)
    const [isAnimating, setIsAnimating] = useState(false)

    useEffect(() => {
      if (value === displayValue) return

      setIsAnimating(true)
      const startValue = displayValue
      const difference = value - startValue
      const startTime = Date.now()

      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)
        
        // Easing function for smooth animation
        const easeOutQuart = 1 - Math.pow(1 - progress, 4)
        const currentValue = startValue + (difference * easeOutQuart)
        
        setDisplayValue(Math.round(currentValue))

        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          setIsAnimating(false)
        }
      }

      requestAnimationFrame(animate)
    }, [value, duration, displayValue])

    return (
      <span className={`transition-all duration-300 ${isAnimating ? 'text-blue-600' : ''}`}>
        {displayValue.toLocaleString()}{suffix}
      </span>
    )
  }

  // Calculate percentage change
  const calculatePercentageChange = (current: number, previous: number): { percentage: number; isPositive: boolean } => {
    if (previous === 0) return { percentage: 0, isPositive: true }
    const change = ((current - previous) / previous) * 100
    return { percentage: Math.abs(Math.round(change)), isPositive: change >= 0 }
  }

  // Helper functions from call history page
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
    } else if (preset === 'all') {
      // Set a very wide range for "all time" - last 2 years to future
      const from = startOfDay(new Date(now.getFullYear() - 2, 0, 1))
      const to = endOfDay(new Date(now.getFullYear() + 1, 11, 31))
      setSelectedRange({ from, to })
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

  // Real-time data updates from VAPI
  const performRealTimeUpdate = useCallback(async () => {
    if (!realTimeEnabled || !selectedRange?.from || !selectedRange?.to) return

    try {
      // Store previous metrics for comparison
      setPreviousMetrics(vapiMetrics)

      // Fetch fresh data from VAPI
      await fetchVapiAnalytics()
    } catch (error) {
      console.error('Real-time update error:', error)
    }
  }, [realTimeEnabled, selectedRange, vapiMetrics])

  // Set up real-time updates
  useEffect(() => {
    if (!realTimeEnabled) return

    const interval = setInterval(performRealTimeUpdate, 30000) // Update every 30 seconds
    return () => clearInterval(interval)
  }, [performRealTimeUpdate, realTimeEnabled])

  // Helper function to extract duration in seconds from Vapi call (same as call history)
  const extractDuration = (call: any): number => {
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

  // Helper function to map Vapi call status (same as call history)
  const mapVapiStatus = (vapiStatus: string): string => {
    switch (vapiStatus?.toLowerCase()) {
      case 'ended':
      case 'completed':
      case 'success':
        return 'completed'
      case 'queued':
      case 'ringing':
      case 'in-progress':
      case 'forwarding':
        return 'in-progress'
      case 'failed':
      case 'busy':
        return 'failed'
      case 'no-answer':
        return 'no-answer'
      case 'voicemail':
        return 'voicemail'
      default:
        return 'unknown'
    }
  }

  // Calculate concurrent calls from VAPI data
  const calculateConcurrentCalls = (calls: any[]): number => {
    if (calls.length === 0) return 0

    // Create events for call start and end times
    const events: { time: number; type: 'start' | 'end' }[] = []
    
    calls.forEach((call: any) => {
      const startTime = new Date(call.startedAt || call.createdAt || Date.now()).getTime()
      const endTime = new Date(call.endedAt || call.updatedAt || Date.now()).getTime()
      
      // Only count calls that have both start and end times
      if (startTime && endTime && endTime > startTime) {
        events.push({ time: startTime, type: 'start' })
        events.push({ time: endTime, type: 'end' })
      }
    })

    // Sort events by time
    events.sort((a, b) => a.time - b.time)

    // Calculate maximum concurrent calls
    let currentConcurrent = 0
    let maxConcurrent = 0

    events.forEach(event => {
      if (event.type === 'start') {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
      } else {
        currentConcurrent--
      }
    })

    return maxConcurrent
  }

  // Fetch VAPI Analytics Data - Using same approach as call history
  const fetchVapiAnalytics = async () => {
    if (!selectedRange?.from || !selectedRange?.to) return
    
    setLoading(true)
    try {
      console.log('Fetching VAPI calls for analytics...')
      const response = await fetch('/api/vapi/calls')
      const result = await response.json()

      if (result.success && result.data) {
        const calls = result.data || []
        console.log(`Vapi API returned ${calls.length} calls`)

        // Filter calls by date range
        const startTime = startOfDay(selectedRange.from).getTime()
        const endTime = endOfDay(selectedRange.to).getTime()
        
        const filteredCalls = calls.filter((call: any) => {
          const callTime = new Date(call.createdAt || call.startedAt || Date.now()).getTime()
          return callTime >= startTime && callTime <= endTime
        })

        console.log(`Filtered to ${filteredCalls.length} calls in date range`)

        // Calculate metrics from raw call data
        const totalCalls = filteredCalls.length
        const totalDurationSec = filteredCalls.reduce((sum: number, call: any) => sum + extractDuration(call), 0)
        const avgDurationSec = totalCalls > 0 ? totalDurationSec / totalCalls : 0

        // Calculate success rate
        const successfulCalls = filteredCalls.filter((call: any) => {
          const status = mapVapiStatus(call.status)
          return status === 'completed'
        }).length
        const successRate = totalCalls > 0 ? Math.round((successfulCalls / totalCalls) * 100) : 0

        // Calculate concurrent calls (max simultaneous calls at any point)
        const concurrentCalls = calculateConcurrentCalls(filteredCalls)

        setVapiMetrics({
          totalCalls,
          totalDuration: Math.round(totalDurationSec / 60), // Convert to minutes
          totalCost: 0, // Keep for interface compatibility but not used
          concurrentCalls,
          avgDuration: parseFloat((avgDurationSec / 60).toFixed(1)), // Convert to minutes
          successRate,
          peakHour: "2:00 PM", // Static for now
          conversionRate: Math.min(successRate + 10, 100), // Estimated
          customerSatisfaction: 4.2 // Static for now
        })

        // Process daily volume data
        const dailyMap = new Map<string, { calls: number; duration: number; cost: number; success: number }>()
        
        filteredCalls.forEach((call: any) => {
          const date = new Date(call.createdAt || call.startedAt || Date.now())
          const dateKey = date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
          const duration = extractDuration(call)
          const isSuccess = mapVapiStatus(call.status) === 'completed'
          
          const existing = dailyMap.get(dateKey) || { calls: 0, duration: 0, cost: 0, success: 0 }
          dailyMap.set(dateKey, {
            calls: existing.calls + 1,
            duration: existing.duration + duration,
            cost: existing.cost + (duration / 60) * 0.01,
            success: existing.success + (isSuccess ? 1 : 0)
          })
        })

        const processedVolumeData: CallVolumeData[] = Array.from(dailyMap.entries()).map(([date, data]) => ({
          date,
          calls: data.calls,
          duration: Math.round(data.duration / 60),
          cost: parseFloat(data.cost.toFixed(2)),
          success: data.success
        }))
        setCallVolumeData(processedVolumeData)

        // Process call outcomes
        const outcomeMap = new Map<string, number>()
        filteredCalls.forEach((call: any) => {
          const outcome = call.status || 'unknown'
          outcomeMap.set(outcome, (outcomeMap.get(outcome) || 0) + 1)
        })

        const processedOutcomes: CallOutcomeData[] = Array.from(outcomeMap.entries()).map(([outcome, count], index) => ({
          outcome,
          count,
          percentage: totalCalls > 0 ? Math.round((count / totalCalls) * 100) : 0,
          color: OUTCOME_COLORS[index % OUTCOME_COLORS.length]
        }))
        setCallOutcomeData(processedOutcomes)

        // Process hourly data
        const hourlyMap = new Map<string, { calls: number; success: number }>()
        filteredCalls.forEach((call: any) => {
          const date = new Date(call.createdAt || call.startedAt || Date.now())
          const hour = date.getHours()
          const hourKey = new Date(`2024-01-01T${hour.toString().padStart(2, '0')}:00:00`).toLocaleTimeString("en-US", { 
            hour: "numeric",
            hour12: true 
          })
          const isSuccess = mapVapiStatus(call.status) === 'completed'
          
          const existing = hourlyMap.get(hourKey) || { calls: 0, success: 0 }
          hourlyMap.set(hourKey, {
            calls: existing.calls + 1,
            success: existing.success + (isSuccess ? 1 : 0)
          })
        })

        const processedHourlyData: HourlyData[] = Array.from(hourlyMap.entries()).map(([hour, data]) => ({
          hour,
          calls: data.calls,
          success: data.success
        }))
        setHourlyData(processedHourlyData)

        // Process geographic data
        const geographicMap = new Map<string, { calls: number; duration: number; success: number }>()
        
        filteredCalls.forEach((call: any) => {
          let region = "Unknown"
          
          const phoneNumber = call.customer?.number || call.phoneNumber || call.toNumber || ""
          if (phoneNumber.startsWith("+1")) {
            region = "North America"
          } else if (phoneNumber.startsWith("+44") || phoneNumber.startsWith("+33") || phoneNumber.startsWith("+49")) {
            region = "Europe"
          } else if (phoneNumber.startsWith("+81") || phoneNumber.startsWith("+86") || phoneNumber.startsWith("+91")) {
            region = "Asia Pacific"
          } else if (phoneNumber.startsWith("+52") || phoneNumber.startsWith("+55") || phoneNumber.startsWith("+54")) {
            region = "Latin America"
          } else if (phoneNumber) {
            region = "Other"
          }

          const existing = geographicMap.get(region) || { calls: 0, duration: 0, success: 0 }
          const duration = extractDuration(call)
          const isSuccess = mapVapiStatus(call.status) === 'completed'
          
          geographicMap.set(region, {
            calls: existing.calls + 1,
            duration: existing.duration + duration,
            success: existing.success + (isSuccess ? 1 : 0)
          })
        })

        const geographicArray = Array.from(geographicMap.entries()).map(([region, data]) => ({
          region,
          calls: data.calls,
          duration: data.duration,
          success: data.success
        }))

        setGeographicData(geographicArray.length > 0 ? geographicArray : [
          { region: "North America", calls: 0, duration: 0, success: 0 },
          { region: "Europe", calls: 0, duration: 0, success: 0 },
          { region: "Asia Pacific", calls: 0, duration: 0, success: 0 },
          { region: "Latin America", calls: 0, duration: 0, success: 0 },
          { region: "Other", calls: 0, duration: 0, success: 0 }
        ])

      } else {
        console.error('Vapi API error:', result.error)
        throw new Error('Failed to fetch calls from Vapi API')
      }

    } catch (error: any) {
      console.error('VAPI Analytics fetch error:', error)
      
      // Set fallback data
      setVapiMetrics({
        totalCalls: 0,
        totalDuration: 0,
        totalCost: 0,
        concurrentCalls: 0,
        avgDuration: 0,
        successRate: 0,
        peakHour: "12:00 PM",
        conversionRate: 0,
        customerSatisfaction: 0
      })
      
      setCallVolumeData([])
      setCallOutcomeData([])
      setHourlyData([])
      setGeographicData([])
    } finally {
      setLoading(false)
    }
  }

  // Fetch talking points from Supabase (as requested)
  const fetchTalkingPoints = async () => {
    if (!supabaseRef.current || !selectedRange?.from || !selectedRange?.to) return
    
    const supabase = supabaseRef.current
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const startISO = startOfDay(selectedRange.from).toISOString()
    const endISO = endOfDay(selectedRange.to).toISOString()

    const owners: string[] = [user.id]
    const { data: memberships } = await supabase
      .from("account_users")
      .select("owner_user_id, is_active")
      .eq("member_user_id", user.id)
      .eq("is_active", true)
    ;(memberships || []).forEach((m: any) => {
      const oid = String(m?.owner_user_id || "")
      if (oid && !owners.includes(oid)) owners.push(oid)
    })

    const { data: talkingPointsEvents, error } = await supabase
      .from("talking_points_events")
      .select("id,category_id,text,created_at")
      .in("user_id", owners)
      .gte("created_at", startISO)
      .lte("created_at", endISO)
      .order("created_at", { ascending: false })

    if (!error && talkingPointsEvents) {
      const textFrequency = new Map<string, number>()
      talkingPointsEvents.forEach((event: any) => {
        if (event.text) {
          const text = event.text.trim()
          textFrequency.set(text, (textFrequency.get(text) || 0) + 1)
        }
      })

      const sortedPoints = Array.from(textFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)

      if (sortedPoints.length > 0) {
        const total = sortedPoints.reduce((sum, [, count]) => sum + count, 0)
        const colors = ["#10b981", "#059669", "#047857", "#065f46", "#064e3b", "#6b7280"]
        
        const talking: TalkingPointDatum[] = sortedPoints.map(([text, count], index) => ({
          name: text.charAt(0).toUpperCase() + text.slice(1).toLowerCase(),
          value: Math.round((count / total) * 100),
          color: colors[index % colors.length],
          calls: count
        }))

        setTalkingPointsData(talking)
      }
    }
  }

  useEffect(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient()
    }
    
    if (selectedRange?.from && selectedRange?.to) {
      fetchVapiAnalytics()
      fetchTalkingPoints()
    }
  }, [selectedRange])

  
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
    
    // Report Header
    csvContent += "COMPREHENSIVE ANALYTICS REPORT\n"
    csvContent += `Generated: ${new Date().toLocaleString()}\n`
    csvContent += `Date Range: ${rangeLabel}\n\n`

    // Key Metrics Summary
    csvContent += "KEY PERFORMANCE METRICS\n"
    csvContent += "Metric,Value,Unit\n"
    csvContent += `Total Calls,${vapiMetrics.totalCalls},calls\n`
    csvContent += `Success Rate,${vapiMetrics.successRate},%\n`
    csvContent += `Average Duration,${vapiMetrics.avgDuration},minutes\n`
    csvContent += `Peak Concurrent Calls,${vapiMetrics.concurrentCalls},calls\n`
    csvContent += `Conversion Rate,${vapiMetrics.conversionRate},%\n`
    csvContent += `Customer Satisfaction,${vapiMetrics.customerSatisfaction},/5.0\n`
    csvContent += `Total Duration,${vapiMetrics.totalDuration},minutes\n`
    csvContent += `Peak Hour,${vapiMetrics.peakHour},time\n\n`

    // Daily Call Volume Data
    csvContent += "DAILY CALL VOLUME ANALYSIS\n"
    csvContent += "Date,Total Calls,Successful Calls,Duration (minutes),Success Rate (%)\n"
    callVolumeData.forEach((item) => {
      const successRate = item.calls > 0 ? Math.round((item.success / item.calls) * 100) : 0
      csvContent += `${item.date},${item.calls},${item.success},${item.duration},${successRate}\n`
    })

    // Call Outcomes Breakdown
    csvContent += "\nCALL OUTCOMES DISTRIBUTION\n"
    csvContent += "Outcome,Count,Percentage\n"
    callOutcomeData.forEach((item) => {
      csvContent += `${item.outcome},${item.count},${item.percentage}%\n`
    })

    // Hourly Distribution
    csvContent += "\nHOURLY CALL DISTRIBUTION\n"
    csvContent += "Hour,Total Calls,Successful Calls,Success Rate (%)\n"
    hourlyData.forEach((item) => {
      const successRate = item.calls > 0 ? Math.round((item.success / item.calls) * 100) : 0
      csvContent += `${item.hour},${item.calls},${item.success},${successRate}\n`
    })

    // Geographic Distribution
    csvContent += "\nGEOGRAPHIC DISTRIBUTION\n"
    csvContent += "Region,Total Calls,Successful Calls,Duration (hours),Success Rate (%)\n"
    geographicData.forEach((item) => {
      const successRate = item.calls > 0 ? Math.round((item.success / item.calls) * 100) : 0
      const durationHours = Math.round(item.duration / 60 * 100) / 100
      csvContent += `${item.region},${item.calls},${item.success},${durationHours},${successRate}\n`
    })

    // Customer Talking Points
    csvContent += "\nCUSTOMER TALKING POINTS ANALYSIS\n"
    csvContent += "Topic,Percentage,Total Mentions,Frequency\n"
    talkingPointsData.forEach((item) => {
      csvContent += `${item.name},${item.value}%,${item.calls},High\n`
    })

    // Performance Benchmarks
    csvContent += "\nPERFORMANCE BENCHMARKS\n"
    csvContent += "Benchmark,Current Value,Industry Standard,Status\n"
    csvContent += `Success Rate,${vapiMetrics.successRate}%,70%,${vapiMetrics.successRate >= 70 ? 'Above Standard' : 'Below Standard'}\n`
    csvContent += `Average Duration,${vapiMetrics.avgDuration} min,3-5 min,${vapiMetrics.avgDuration >= 3 && vapiMetrics.avgDuration <= 8 ? 'Optimal' : vapiMetrics.avgDuration > 8 ? 'Above Optimal' : 'Below Optimal'}\n`
    csvContent += `Concurrent Capacity,${vapiMetrics.concurrentCalls},10,${vapiMetrics.concurrentCalls <= 10 ? 'Within Limits' : 'Above Capacity'}\n`
    csvContent += `Conversion Rate,${vapiMetrics.conversionRate}%,60%,${vapiMetrics.conversionRate >= 60 ? 'Above Standard' : 'Below Standard'}\n`

    // AI Insights Summary
    csvContent += "\nAI-POWERED INSIGHTS SUMMARY\n"
    csvContent += "Category,Analysis,Recommendation\n"
    csvContent += `Conversational AI Performance,${vapiMetrics.successRate > 85 ? 'Exceptional' : vapiMetrics.successRate > 70 ? 'Strong' : 'Developing'} conversational intelligence,${vapiMetrics.successRate > 85 ? 'Maintain current performance' : 'Optimize dialogue management systems'}\n`
    csvContent += `Infrastructure Scalability,${vapiMetrics.concurrentCalls > 8 ? 'Robust' : vapiMetrics.concurrentCalls > 4 ? 'Solid' : 'Foundational'} concurrent processing,${vapiMetrics.concurrentCalls > 8 ? 'Monitor for optimization opportunities' : 'Consider infrastructure scaling'}\n`
    csvContent += `Predictive Analytics,${vapiMetrics.conversionRate > 80 ? 'Exceptional' : vapiMetrics.conversionRate > 60 ? 'Strong' : 'Developing'} conversion optimization,${vapiMetrics.conversionRate > 80 ? 'Leverage advanced behavioral analytics' : 'Enhance predictive modeling capabilities'}\n`

    // System Capacity Analysis
    csvContent += "\nSYSTEM CAPACITY ANALYSIS\n"
    csvContent += "Metric,Current,Capacity,Utilization (%),Status\n"
    const utilization = vapiMetrics.concurrentCalls > 0 ? Math.round((vapiMetrics.concurrentCalls / 10) * 100) : 0
    csvContent += `Concurrent Calls,${vapiMetrics.concurrentCalls},10,${utilization},${utilization < 70 ? 'Optimal' : utilization < 90 ? 'High' : 'Critical'}\n`
    csvContent += `Call Volume,${vapiMetrics.totalCalls},Unlimited,N/A,Active\n`
    csvContent += `Average Response Time,${vapiMetrics.avgDuration} min,<5 min,N/A,${vapiMetrics.avgDuration <= 5 ? 'Optimal' : 'Review Required'}\n`

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `comprehensive_analytics_report_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const downloadAllPDF = () => {
    console.log("PDF download initiated for analytics report")
    alert("Combined PDF report download would start here")
  }

  
  return (
    <TooltipProvider>
      <div className="ml-20 p-6 bg-white min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-black mb-2">Analytics Dashboard</h1>
        <p className="text-gray-600">Analyze your AI agent performance and customer interactions</p>
      </div>

      {/* Date Range Selection - Same as Call History */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
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
      </div>

      {/* Comprehensive VAPI Analytics Dashboard */}
      {selectedRange?.from && selectedRange?.to ? (
        <div className="space-y-8">
          {/* Key Metrics Cards with Real-time Animation */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <UITooltip>
              <TooltipTrigger asChild>
                <Card className="bg-white border-gray-200 hover:shadow-lg transition-all duration-300 cursor-help">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-blue-600">Total Calls</p>
                          <Info className="h-3 w-3 text-blue-400" />
                        </div>
                    <p className="text-3xl font-bold text-blue-900">
                      <AnimatedCounter value={vapiMetrics.totalCalls} />
                    </p>
                    <div className="flex items-center mt-2">
                      {(() => {
                        const change = calculatePercentageChange(vapiMetrics.totalCalls, previousMetrics.totalCalls)
                        return (
                          <>
                            {change.isPositive ? (
                              <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
                            )}
                            <span className={`text-sm ${change.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                              {change.isPositive ? '+' : '-'}{change.percentage}% from last period
                            </span>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                  <div className="relative">
                    <Phone className="h-12 w-12 text-blue-500" />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  Total number of AI agent calls made during the selected time period. 
                  Includes all call statuses from the VAPI platform. Updates in real-time.
                </p>
              </TooltipContent>
            </UITooltip>

            <UITooltip>
              <TooltipTrigger asChild>
                <Card className="bg-white border-gray-200 hover:shadow-lg transition-all duration-300 cursor-help">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-green-600">Success Rate</p>
                      <Info className="h-3 w-3 text-green-400" />
                    </div>
                    <p className="text-3xl font-bold text-green-900">
                      <AnimatedCounter value={vapiMetrics.successRate} suffix="%" />
                    </p>
                    <div className="flex items-center mt-2">
                      {(() => {
                        const change = calculatePercentageChange(vapiMetrics.successRate, previousMetrics.successRate)
                        return (
                          <>
                            {change.isPositive ? (
                              <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
                            )}
                            <span className={`text-sm ${change.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                              {change.percentage > 0 ? `${change.isPositive ? '+' : '-'}${change.percentage}% change` : 'Above target'}
                            </span>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                  <div className="relative">
                    <Activity className="h-12 w-12 text-green-500" />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  Percentage of calls that ended successfully (completed status). 
                  Higher success rates indicate better AI agent performance and customer engagement.
                </p>
              </TooltipContent>
            </UITooltip>

            <UITooltip>
              <TooltipTrigger asChild>
                <Card className="bg-white border-gray-200 hover:shadow-lg transition-all duration-300 cursor-help">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-purple-600">Avg Duration</p>
                      <Info className="h-3 w-3 text-purple-400" />
                    </div>
                    <p className="text-3xl font-bold text-purple-900">
                      <AnimatedCounter value={vapiMetrics.avgDuration} suffix="m" />
                    </p>
                    <div className="flex items-center mt-2">
                      {(() => {
                        const change = calculatePercentageChange(vapiMetrics.avgDuration, previousMetrics.avgDuration)
                        return (
                          <>
                            {change.isPositive ? (
                              <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
                            )}
                            <span className={`text-sm ${change.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                              {change.percentage > 0 ? `${change.isPositive ? '+' : '-'}${change.percentage}% change` : 'Optimal range'}
                            </span>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                  <div className="relative">
                    <Clock className="h-12 w-12 text-purple-500" />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  Average duration of all calls in minutes. 
                  Longer durations typically indicate better customer engagement and conversation quality.
                </p>
              </TooltipContent>
            </UITooltip>

            <UITooltip>
              <TooltipTrigger asChild>
                <Card className="bg-white border-gray-200 hover:shadow-lg transition-all duration-300 cursor-help">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-amber-600">Concurrent Calls</p>
                      <Info className="h-3 w-3 text-amber-400" />
                    </div>
                    <p className="text-3xl font-bold text-amber-900">
                      <AnimatedCounter value={vapiMetrics.concurrentCalls} />
                    </p>
                    <div className="flex items-center mt-2">
                      {(() => {
                        const change = calculatePercentageChange(vapiMetrics.concurrentCalls, previousMetrics.concurrentCalls)
                        return (
                          <>
                            {change.isPositive ? (
                              <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
                            )}
                            <span className={`text-sm ${change.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                              {change.percentage > 0 ? `${change.isPositive ? '+' : '-'}${change.percentage}% change` : 'Stable capacity'}
                            </span>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                  <div className="relative">
                    <Users className="h-12 w-12 text-amber-500" />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  Maximum number of simultaneous calls that occurred at any point during the selected period. 
                  Helps monitor system capacity and performance under load.
                </p>
              </TooltipContent>
            </UITooltip>
          </div>

          {/* Tabbed Analytics */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="performance" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Performance
              </TabsTrigger>
              <TabsTrigger value="insights" className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Insights
              </TabsTrigger>
              <TabsTrigger value="geographic" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Geographic
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Call Volume Trend */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <LineChart className="h-5 w-5 text-blue-500" />
                      Call Volume Trend
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={callVolumeData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxisAny dataKey="date" />
                        <YAxisAny />
                        <RechartsTooltip />
                        <Area type="monotone" dataKey="calls" stroke="#14b8a6" fill="#14b8a6" fillOpacity={0.3} />
                        <Area type="monotone" dataKey="success" stroke="#0d9488" fill="#0d9488" fillOpacity={0.3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Call Outcomes */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PieChartIcon className="h-5 w-5 text-green-500" />
                      Call Outcomes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={callOutcomeData}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          dataKey="count"
                          label={({ name, percentage }) => `${name}: ${percentage}%`}
                        >
                          {callOutcomeData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Hourly Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-purple-500" />
                    Hourly Call Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={hourlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxisAny dataKey="hour" />
                      <YAxisAny />
                      <RechartsTooltip />
                      <Bar dataKey="calls" fill="#14b8a6" />
                      <Bar dataKey="success" fill="#0d9488" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="performance" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Performance Metrics */}
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Success Rate</span>
                        <span className="text-sm text-gray-600">{vapiMetrics.successRate}%</span>
                      </div>
                      <Progress value={vapiMetrics.successRate} className="h-2" />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Conversion Rate</span>
                        <span className="text-sm text-gray-600">{vapiMetrics.conversionRate}%</span>
                      </div>
                      <Progress value={vapiMetrics.conversionRate} className="h-2" />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Customer Satisfaction</span>
                        <span className="text-sm text-gray-600">{vapiMetrics.customerSatisfaction}/5.0</span>
                      </div>
                      <Progress value={(vapiMetrics.customerSatisfaction / 5) * 100} className="h-2" />
                    </div>
                  </CardContent>
                </Card>

                {/* Concurrency Analysis */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-amber-500" />
                      Concurrency Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="text-center p-4 bg-amber-50 rounded-lg">
                        <Users className="h-12 w-12 text-amber-500 mx-auto mb-2" />
                        <p className="text-sm text-gray-600">Peak Concurrent Calls</p>
                        <p className="text-3xl font-bold text-amber-900">{vapiMetrics.concurrentCalls}</p>
                        <p className="text-xs text-gray-500 mt-1">Maximum simultaneous calls</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                          <p className="text-sm text-gray-600">Avg Utilization</p>
                          <p className="text-lg font-bold text-blue-900">
                            {vapiMetrics.concurrentCalls > 0 ? Math.round((vapiMetrics.totalCalls / vapiMetrics.concurrentCalls) * 10) / 10 : 0}%
                          </p>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-lg">
                          <p className="text-sm text-gray-600">Capacity Status</p>
                          <p className="text-lg font-bold text-green-900">
                            {vapiMetrics.concurrentCalls < 5 ? 'Low' : vapiMetrics.concurrentCalls < 15 ? 'Medium' : 'High'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="mt-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium">Concurrency Level</span>
                          <span className="text-sm text-gray-600">{vapiMetrics.concurrentCalls} calls</span>
                        </div>
                        <Progress value={Math.min((vapiMetrics.concurrentCalls / 10) * 100, 100)} className="h-2" />
                        <p className="text-xs text-gray-500 mt-1">Based on maximum 10 concurrent calls capacity</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Peak Performance Insights */}
              <Card>
                <CardHeader>
                  <CardTitle>Peak Performance Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <Clock className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">Peak Hour</p>
                      <p className="text-lg font-bold text-blue-900">{vapiMetrics.peakHour}</p>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <TrendingUp className="h-8 w-8 text-green-500 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">Best Day</p>
                      <p className="text-lg font-bold text-green-900">Tuesday</p>
                    </div>
                    <div className="text-center p-4 bg-purple-50 rounded-lg">
                      <Target className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">Optimal Duration</p>
                      <p className="text-lg font-bold text-purple-900">5-8 min</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="insights" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Customer Talking Points */}
                <Card>
                  <CardHeader>
                    <CardTitle>Customer Talking Points</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {talkingPointsData.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={250}>
                          <PieChart>
                            <Pie
                              data={talkingPointsData}
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              dataKey="value"
                              onClick={(data) => handlePieClick(data, "talking")}
                              style={{ cursor: "pointer" }}
                            >
                              {talkingPointsData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <RechartsTooltip formatter={(value, name, props) => [`${value}% (${props.payload.calls} mentions)`, "Interest"]} />
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
                      </>
                    ) : (
                      <div className="text-center py-8">
                        <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No talking points data available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* AI Insights */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-gray-600" />
                      AI-Powered Insights
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 bg-gray-50 rounded-lg border-l-4 border-black">
                      <h4 className="font-medium text-black mb-2">Call Performance Analysis</h4>
                      <p className="text-sm text-gray-700">
                        {vapiMetrics.totalCalls > 0 ? (
                          <>
                            Based on {vapiMetrics.totalCalls} total calls with a {vapiMetrics.successRate}% success rate, your AI agent shows {vapiMetrics.successRate >= 80 ? 'excellent' : vapiMetrics.successRate >= 60 ? 'good' : 'developing'} performance. 
                            {vapiMetrics.avgDuration > 0 && ` Average call duration of ${vapiMetrics.avgDuration} minutes indicates ${vapiMetrics.avgDuration >= 5 ? 'strong customer engagement' : vapiMetrics.avgDuration >= 3 ? 'moderate engagement levels' : 'brief but efficient interactions'}.`}
                            {callOutcomeData.length > 0 && ` The most common outcome is "${callOutcomeData[0]?.outcome}" representing ${callOutcomeData[0]?.percentage}% of all calls.`}
                          </>
                        ) : (
                          'No call data available for analysis. Start making calls to see performance insights.'
                        )}
                      </p>
                    </div>
                    <div className="p-4 bg-white rounded-lg border-l-4 border-gray-400">
                      <h4 className="font-medium text-black mb-2">System Capacity Insights</h4>
                      <p className="text-sm text-gray-700">
                        {vapiMetrics.concurrentCalls > 0 ? (
                          <>
                            Peak concurrent calls reached {vapiMetrics.concurrentCalls}, indicating {vapiMetrics.concurrentCalls >= 8 ? 'high system utilization' : vapiMetrics.concurrentCalls >= 4 ? 'moderate load handling' : 'low to moderate usage'}. 
                            {hourlyData.length > 0 && (() => {
                              const peakHour = hourlyData.reduce((max, hour) => hour.calls > max.calls ? hour : max, hourlyData[0])
                              return ` Peak activity occurs at ${peakHour?.hour} with ${peakHour?.calls} calls.`
                            })()}
                            {geographicData.length > 0 && (() => {
                              const topRegion = geographicData.reduce((max, region) => region.calls > max.calls ? region : max, geographicData[0])
                              return ` Most calls originate from ${topRegion?.region} (${topRegion?.calls} calls).`
                            })()}
                          </>
                        ) : (
                          'System capacity metrics will appear once call activity begins.'
                        )}
                      </p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg border-l-4 border-gray-600">
                      <h4 className="font-medium text-black mb-2">Optimization Recommendations</h4>
                      <p className="text-sm text-gray-700">
                        {vapiMetrics.totalCalls > 0 ? (
                          <>
                            {vapiMetrics.successRate < 70 && 'Consider reviewing call scripts and AI training to improve success rates. '}
                            {vapiMetrics.avgDuration < 2 && 'Calls are ending quickly - review conversation flow to increase engagement. '}
                            {vapiMetrics.avgDuration > 10 && 'Long call durations detected - optimize for efficiency while maintaining quality. '}
                            {vapiMetrics.concurrentCalls >= 8 && 'High concurrent usage - monitor system performance and consider scaling. '}
                            {callVolumeData.length > 0 && (() => {
                              const totalSuccess = callVolumeData.reduce((sum, day) => sum + day.success, 0)
                              const totalCalls = callVolumeData.reduce((sum, day) => sum + day.calls, 0)
                              const overallRate = totalCalls > 0 ? Math.round((totalSuccess / totalCalls) * 100) : 0
                              return overallRate < vapiMetrics.successRate ? 'Recent performance shows improvement trends. ' : 'Maintain current performance levels. '
                            })()}
                            {talkingPointsData.length > 0 && `Focus on "${talkingPointsData[0]?.name}" topics which show ${talkingPointsData[0]?.value}% customer interest.`}
                          </>
                        ) : (
                          'Optimization recommendations will be generated based on your call performance data.'
                        )}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="geographic" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-indigo-500" />
                    Geographic Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {geographicData.map((region, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{region.region}</h4>
                          <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                            <span>{region.calls} calls</span>
                            <span>{Math.round(region.duration / 60)} hours</span>
                            <span>{Math.round((region.success / region.calls) * 100)}% success</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-gray-900">{region.success}</div>
                          <div className="text-sm text-gray-500">successful</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Export Section */}
          <Card>
            <CardHeader>
              <CardTitle>Export Analytics Report</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <Button onClick={downloadAllCSV} className="flex items-center gap-2 bg-black hover:bg-gray-800 text-white">
                  Download CSV Report
                </Button>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Export includes comprehensive VAPI analytics, call outcomes, performance metrics, and customer insights for the selected date range
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="mb-8">
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Please select at least 2 dates to view comprehensive analytics</p>
            </div>
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
    </TooltipProvider>
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
