"use client"

import { useEffect, useState } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Treemap } from "recharts"
import { VapiAnalyticsRequest } from "@/lib/api/vapi"

interface OutcomeData {
  name: string
  value: number
  percentage: number
  color: string
  category: "success" | "failure" | "neutral"
  description: string
}

interface CallOutcomeBreakdownProps {
  dateRange: {
    start: string
    end: string
  }
}

// Enhanced categorization with descriptions
const OUTCOME_CONFIG = {
  "customer-ended-call": { 
    category: "success" as const, 
    color: "#10b981", 
    description: "Customer successfully completed the call" 
  },
  "assistant-ended-call": { 
    category: "success" as const, 
    color: "#059669", 
    description: "AI assistant completed the call successfully" 
  },
  "assistant-ended-call-after-message-spoken": { 
    category: "success" as const, 
    color: "#047857", 
    description: "Call completed after delivering message" 
  },
  "vonage-completed": { 
    category: "success" as const, 
    color: "#065f46", 
    description: "Call completed successfully via Vonage" 
  },
  "customer-did-not-answer": { 
    category: "failure" as const, 
    color: "#ef4444", 
    description: "Customer did not pick up the call" 
  },
  "customer-busy": { 
    category: "failure" as const, 
    color: "#dc2626", 
    description: "Customer's line was busy" 
  },
  "customer-did-not-give-microphone-permission": { 
    category: "failure" as const, 
    color: "#b91c1c", 
    description: "Customer denied microphone access" 
  },
  "assistant-error": { 
    category: "failure" as const, 
    color: "#991b1b", 
    description: "AI assistant encountered an error" 
  },
  "twilio-failed-to-connect-call": { 
    category: "failure" as const, 
    color: "#7f1d1d", 
    description: "Twilio service failed to connect" 
  },
  "vonage-failed-to-connect-call": { 
    category: "failure" as const, 
    color: "#7c2d12", 
    description: "Vonage service failed to connect" 
  },
  "vonage-rejected": { 
    category: "failure" as const, 
    color: "#78350f", 
    description: "Call rejected by Vonage service" 
  },
  "database-error": { 
    category: "failure" as const, 
    color: "#713f12", 
    description: "Database error occurred during call" 
  },
  "unknown-error": { 
    category: "failure" as const, 
    color: "#6b7280", 
    description: "Unknown error occurred" 
  },
  "voicemail": { 
    category: "neutral" as const, 
    color: "#f59e0b", 
    description: "Call went to voicemail" 
  },
  "exceeded-max-duration": { 
    category: "neutral" as const, 
    color: "#d97706", 
    description: "Call exceeded maximum duration limit" 
  },
  "silence-timed-out": { 
    category: "neutral" as const, 
    color: "#b45309", 
    description: "Call ended due to prolonged silence" 
  },
  "manually-canceled": { 
    category: "neutral" as const, 
    color: "#92400e", 
    description: "Call was manually canceled" 
  }
}

export function CallOutcomeBreakdown({ dateRange }: CallOutcomeBreakdownProps) {
  const [data, setData] = useState<OutcomeData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"pie" | "treemap">("pie")

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const analyticsRequest: VapiAnalyticsRequest = {
          queries: [
            {
              table: "call",
              name: "outcome_breakdown",
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

        // Transform and categorize data
        const chartData: OutcomeData[] = rawData.map((item: any) => {
          const endedReason = item.endedReason || 'unknown-error'
          const count = item.countId || 0
          const percentage = Math.round((count / totalCalls) * 100)
          
          const config = OUTCOME_CONFIG[endedReason as keyof typeof OUTCOME_CONFIG] || {
            category: "neutral" as const,
            color: "#6b7280",
            description: "Unknown outcome"
          }

          return {
            name: endedReason.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            value: count,
            percentage,
            color: config.color,
            category: config.category,
            description: config.description
          }
        }).sort((a, b) => b.value - a.value)

        setData(chartData)
      } catch (err: any) {
        console.error('Call outcome fetch error:', err)
        setError(err.message || 'Failed to load call outcome data')
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
          <p className="text-gray-500">No call outcome data available for selected period</p>
        </div>
      </div>
    )
  }

  // Calculate category summaries
  const categoryStats = {
    success: data.filter(item => item.category === "success").reduce((sum, item) => sum + item.value, 0),
    failure: data.filter(item => item.category === "failure").reduce((sum, item) => sum + item.value, 0),
    neutral: data.filter(item => item.category === "neutral").reduce((sum, item) => sum + item.value, 0)
  }

  const totalCalls = categoryStats.success + categoryStats.failure + categoryStats.neutral

  return (
    <div className="space-y-4">
      {/* View Mode Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode("pie")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            viewMode === "pie" 
              ? "bg-orange-500 text-white" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Pie Chart
        </button>
        <button
          onClick={() => setViewMode("treemap")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            viewMode === "treemap" 
              ? "bg-orange-500 text-white" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Treemap
        </button>
      </div>

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === "pie" ? (
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                outerRadius={120}
                dataKey="value"
                label={({ name, percentage }) => percentage > 5 ? `${percentage}%` : ''}
                labelLine={false}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: any, name: any, props: any) => [
                  `${value} calls (${props.payload.percentage}%)`, 
                  props.payload.name
                ]}
                labelFormatter={(label: any, payload: any) => {
                  const item = payload?.[0]?.payload
                  return item ? item.description : label
                }}
              />
            </PieChart>
          ) : (
            <Treemap
              data={data}
              dataKey="value"
              aspectRatio={4/3}
              stroke="#fff"
              fill="#8884d8"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Treemap>
          )}
        </ResponsiveContainer>
      </div>

      {/* Category Summary */}
      <div className="grid grid-cols-3 gap-4 pt-4 border-t">
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">
            {Math.round((categoryStats.success / totalCalls) * 100)}%
          </p>
          <p className="text-sm text-gray-500">Success ({categoryStats.success})</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-red-600">
            {Math.round((categoryStats.failure / totalCalls) * 100)}%
          </p>
          <p className="text-sm text-gray-500">Failure ({categoryStats.failure})</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-amber-600">
            {Math.round((categoryStats.neutral / totalCalls) * 100)}%
          </p>
          <p className="text-sm text-gray-500">Neutral ({categoryStats.neutral})</p>
        </div>
      </div>

      {/* Top Outcomes List */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-3">Top Call Outcomes</h4>
        <div className="space-y-2">
          {data.slice(0, 5).map((item, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: item.color }}
                ></div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.name}</p>
                  <p className="text-xs text-gray-500">{item.description}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{item.percentage}%</p>
                <p className="text-xs text-gray-500">{item.value} calls</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
