"use client"

import { useEffect, useState } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import { VapiAnalyticsRequest } from "@/lib/api/vapi"

// Recharts type compatibility shim for React 19/TS 5
const XAxisAny: any = XAxis
const YAxisAny: any = YAxis

interface SuccessRateData {
  endedReason: string
  count: number
  percentage: number
  color: string
  category: "success" | "failure" | "neutral"
}

interface SuccessRateChartProps {
  dateRange: {
    start: string
    end: string
  }
}

// Define success/failure categories based on Vapi endedReason codes
const ENDED_REASON_CATEGORIES = {
  success: [
    "customer-ended-call",
    "assistant-ended-call", 
    "assistant-ended-call-after-message-spoken",
    "vonage-completed"
  ],
  failure: [
    "customer-did-not-answer",
    "customer-busy",
    "customer-did-not-give-microphone-permission",
    "assistant-error",
    "pipeline-error",
    "twilio-failed-to-connect-call",
    "vonage-failed-to-connect-call",
    "vonage-rejected",
    "database-error",
    "unknown-error"
  ],
  neutral: [
    "voicemail",
    "exceeded-max-duration",
    "silence-timed-out",
    "manually-canceled"
  ]
}

const CATEGORY_COLORS = {
  success: "#10b981",
  failure: "#ef4444", 
  neutral: "#f59e0b"
}

export function SuccessRateChart({ dateRange }: SuccessRateChartProps) {
  const [data, setData] = useState<SuccessRateData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"pie" | "bar">("pie")

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const analyticsRequest: VapiAnalyticsRequest = {
          queries: [
            {
              table: "call",
              name: "success_rates",
              operations: [
                { operation: "count", column: "id" }
              ],
              timeRange: {
                start: dateRange.start,
                end: dateRange.end,
                timezone: "UTC"
              },
              groupBy: ["endedReason"]
            }
          ]
        }

        const response = await fetch('/api/vapi/analytics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(analyticsRequest),
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const result = await response.json()
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch analytics')
        }

        const rawData = result.data[0]?.result || []
        const totalCalls = rawData.reduce((sum: number, item: any) => sum + (item.countId || 0), 0)
        
        if (totalCalls === 0) {
          setData([])
          return
        }

        // Categorize and transform data
        const chartData: SuccessRateData[] = rawData.map((item: any) => {
          const endedReason = item.endedReason || 'unknown'
          const count = item.countId || 0
          const percentage = Math.round((count / totalCalls) * 100)
          
          let category: "success" | "failure" | "neutral" = "neutral"
          if (ENDED_REASON_CATEGORIES.success.includes(endedReason)) {
            category = "success"
          } else if (ENDED_REASON_CATEGORIES.failure.includes(endedReason)) {
            category = "failure"
          }

          return {
            endedReason: endedReason.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            count,
            percentage,
            color: CATEGORY_COLORS[category],
            category
          }
        }).sort((a, b) => b.count - a.count)

        setData(chartData)
      } catch (err: any) {
        console.error('Success rate fetch error:', err)
        setError(err.message || 'Failed to load success rate data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [dateRange])

  if (loading) {
    return (
      <div className="h-80 flex items-center justify-center">
        <div className="animate-pulse h-64 w-full bg-gray-200 rounded"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-80 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-2">Error loading data</p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">No call data available for selected period</p>
        </div>
      </div>
    )
  }

  // Calculate summary stats
  const totalCalls = data.reduce((sum, item) => sum + item.count, 0)
  const successCalls = data.filter(item => item.category === "success").reduce((sum, item) => sum + item.count, 0)
  const failureCalls = data.filter(item => item.category === "failure").reduce((sum, item) => sum + item.count, 0)
  const successRate = Math.round((successCalls / totalCalls) * 100)

  return (
    <div className="space-y-4">
      {/* View Mode Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode("pie")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            viewMode === "pie" 
              ? "bg-blue-500 text-white" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Pie Chart
        </button>
        <button
          onClick={() => setViewMode("bar")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            viewMode === "bar" 
              ? "bg-blue-500 text-white" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Bar Chart
        </button>
      </div>

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === "pie" ? (
            <PieChart>
              <Pie
                data={data.slice(0, 8)} // Show top 8 reasons
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="count"
                label={({ endedReason, percentage }) => `${endedReason}: ${percentage}%`}
                labelLine={false}
              >
                {data.slice(0, 8).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: any, name: any, props: any) => [
                  `${value} calls (${props.payload.percentage}%)`, 
                  props.payload.endedReason
                ]}
              />
            </PieChart>
          ) : (
            <BarChart data={data.slice(0, 10)} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxisAny 
                dataKey="endedReason" 
                tick={{ fill: "#6b7280", fontSize: 10 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxisAny 
                tick={{ fill: "#6b7280", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip 
                formatter={(value: any, name: any, props: any) => [
                  `${value} calls (${props.payload.percentage}%)`, 
                  "Count"
                ]}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.slice(0, 10).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 pt-4 border-t">
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">{successRate}%</p>
          <p className="text-sm text-gray-500">Success Rate</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">{successCalls}</p>
          <p className="text-sm text-gray-500">Successful Calls</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-red-600">{failureCalls}</p>
          <p className="text-sm text-gray-500">Failed Calls</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 pt-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="text-sm text-gray-600">Success</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span className="text-sm text-gray-600">Failure</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          <span className="text-sm text-gray-600">Neutral</span>
        </div>
      </div>
    </div>
  )
}
