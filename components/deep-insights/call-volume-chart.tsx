"use client"

import { useEffect, useState } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts"
import { VapiAnalyticsRequest } from "@/lib/api/vapi"

// Recharts type compatibility shim for React 19/TS 5
const XAxisAny: any = XAxis
const YAxisAny: any = YAxis

interface CallVolumeData {
  date: string
  calls: number
  duration: number
  cost: number
}

interface CallVolumeChartProps {
  dateRange: {
    start: string
    end: string
  }
}

export function CallVolumeChart({ dateRange }: CallVolumeChartProps) {
  const [data, setData] = useState<CallVolumeData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"calls" | "duration" | "cost">("calls")

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const analyticsRequest: VapiAnalyticsRequest = {
          queries: [
            {
              table: "call",
              name: "daily_volume",
              operations: [
                { operation: "count", column: "id" },
                { operation: "sum", column: "duration" },
                { operation: "sum", column: "cost" }
              ],
              timeRange: {
                step: "day",
                start: dateRange.start,
                end: dateRange.end,
                timezone: "UTC"
              },
              groupBy: ["date"]
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

        const volumeData = result.data[0]?.result || []
        
        // Transform data for chart
        const chartData: CallVolumeData[] = volumeData.map((item: any) => ({
          date: new Date(item.date).toLocaleDateString("en-US", { 
            month: "short", 
            day: "numeric" 
          }),
          calls: item.countId || 0,
          duration: Math.round((item.sumDuration || 0) / 60), // Convert to minutes
          cost: parseFloat((item.sumCost || 0).toFixed(2))
        }))

        setData(chartData)
      } catch (err: any) {
        console.error('Call volume fetch error:', err)
        setError(err.message || 'Failed to load call volume data')
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

  const getDataKey = () => {
    switch (viewMode) {
      case "duration": return "duration"
      case "cost": return "cost"
      default: return "calls"
    }
  }

  const getLabel = () => {
    switch (viewMode) {
      case "duration": return "Duration (minutes)"
      case "cost": return "Cost ($)"
      default: return "Number of Calls"
    }
  }

  const getColor = () => {
    switch (viewMode) {
      case "duration": return "#3b82f6"
      case "cost": return "#f59e0b"
      default: return "#10b981"
    }
  }

  return (
    <div className="space-y-4">
      {/* View Mode Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode("calls")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            viewMode === "calls" 
              ? "bg-green-500 text-white" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Call Count
        </button>
        <button
          onClick={() => setViewMode("duration")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            viewMode === "duration" 
              ? "bg-blue-500 text-white" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Duration
        </button>
        <button
          onClick={() => setViewMode("cost")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            viewMode === "cost" 
              ? "bg-amber-500 text-white" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Cost
        </button>
      </div>

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxisAny 
              dataKey="date" 
              tick={{ fill: "#6b7280", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxisAny 
              tick={{ fill: "#6b7280", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip 
              formatter={(value: any) => [value, getLabel()]}
              labelStyle={{ color: "#374151" }}
              contentStyle={{ 
                backgroundColor: "white", 
                border: "1px solid #e5e7eb",
                borderRadius: "6px"
              }}
            />
            <Bar 
              dataKey={getDataKey()} 
              fill={getColor()}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 pt-4 border-t">
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">
            {data.reduce((sum, item) => sum + item.calls, 0)}
          </p>
          <p className="text-sm text-gray-500">Total Calls</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-600">
            {data.reduce((sum, item) => sum + item.duration, 0)}m
          </p>
          <p className="text-sm text-gray-500">Total Duration</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-amber-600">
            ${data.reduce((sum, item) => sum + item.cost, 0).toFixed(2)}
          </p>
          <p className="text-sm text-gray-500">Total Cost</p>
        </div>
      </div>
    </div>
  )
}
