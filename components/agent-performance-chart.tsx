"use client"

import { useEffect, useState } from "react"
import { Bar, XAxis, YAxis, ResponsiveContainer, Line, ComposedChart } from "recharts"
import { createClient } from "@/lib/supabase/client"

interface DailyCallData {
  day: string
  performance: number
  line: number
}

export function AgentPerformanceChart() {
  const [callData, setCallData] = useState<DailyCallData[]>([])
  const [averagePerformance, setAveragePerformance] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // Function to fetch call data and format it for the chart
    const fetchCallData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) return
        
        // Get current date info for creating weekly data
        const today = new Date()
        const dayOfWeek = today.getDay() // 0 = Sunday, 6 = Saturday
        const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        
        // Calculate date range for the past week
        const startDate = new Date(today)
        startDate.setDate(today.getDate() - dayOfWeek - 1) // Go back to last Saturday
        
        // Fetch call history data
        const { data: callHistoryData, error } = await supabase
          .from("call_history")
          .select("*")
          .eq("user_id", user.id)
          .gte("call_date", startDate.toISOString())
          .order("call_date", { ascending: true })
        
        if (error) {
          console.error("Error fetching call history:", error)
          return
        }

        // Group calls by day
        const dailyData: Record<string, { count: number, completed: number }> = {}
        
        // Initialize all days of the week with zeros
        for (let i = 0; i < 7; i++) {
          const day = weekDays[i]
          dailyData[day] = { count: 0, completed: 0 }
        }
        
        // Fill in actual data
        callHistoryData?.forEach(call => {
          const callDate = new Date(call.call_date)
          const day = weekDays[callDate.getDay()]
          
          dailyData[day].count++
          if (call.status === "completed") {
            dailyData[day].completed++
          }
        })
        
        // Calculate performance (% of completed calls)
        const chartData: DailyCallData[] = Object.entries(dailyData).map(([day, data]) => {
          const performance = data.count > 0 ? Math.round((data.completed / data.count) * 100) : 0
          return {
            day,
            performance,
            line: performance // Line follows the same data points
          }
        })
        
        // Calculate average performance
        const totalPerformance = chartData.reduce((sum, day) => sum + day.performance, 0)
        const avgPerf = Math.round(totalPerformance / chartData.length)
        
        setCallData(chartData)
        setAveragePerformance(avgPerf)
        setLoading(false)
      } catch (error) {
        console.error("Error in fetchCallData:", error)
        setLoading(false)
      }
    }

    fetchCallData()
    
    // Set up subscription for real-time updates
    const callsSubscription = supabase
      .channel('call-history-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'call_history' },
        () => {
          fetchCallData() // Refetch data when changes occur
        }
      )
      .subscribe()
      
    return () => {
      supabase.removeChannel(callsSubscription)
    }
  }, [supabase])

  // Show placeholder while loading
  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-pulse h-40 w-full bg-gray-200 rounded"></div>
      </div>
    )
  }

  return (
    <div className="h-64">
      <div className="flex justify-between text-sm text-gray-500 mb-4">
        <span>0 %</span>
        <span>100 %</span>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={callData}>
          <XAxis dataKey="day" axisLine={false} tickLine={false} className="text-xs text-gray-500" />
          <YAxis hide domain={[0, 100]} />
          <Bar dataKey="performance" fill="#e0e7ff" radius={[4, 4, 4, 4]} />
          <Line
            type="monotone"
            dataKey="line"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ fill: "#10b981", strokeWidth: 2, r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-2 text-center">
        <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
          {averagePerformance}%
        </span>
      </div>
    </div>
  )
}
