"use client"

import { useEffect, useState } from "react"
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area } from "recharts"
import { VapiAnalyticsRequest } from "@/lib/api/vapi"

// Recharts type compatibility shim for React 19/TS 5
const XAxisAny: any = XAxis
const YAxisAny: any = YAxis

interface PerformanceData {
  date: string
  avgDuration: number
  successRate: number
  avgCost: number
  totalCalls: number
}

interface PerformanceBenchmarkChartProps {
  dateRange: {
    start: string
    end: string
  }
}

export function PerformanceBenchmarkChart({ dateRange }: PerformanceBenchmarkChartProps) {
  const [data, setData] = useState<PerformanceData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"duration-success" | "cost-trend" | "satisfaction">("duration-success")

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const analyticsRequest: VapiAnalyticsRequest = {
          queries: [
            {
              table: "call",
              name: "performance_metrics",
              operations: [
                { operation: "avg", column: "duration" },
                { operation: "count", column: "id" },
                { operation: "avg", column: "cost" }
              ],
              timeRange: {
                step: "day",
                start: dateRange.start,
                end: dateRange.end,
                timezone: "UTC"
              },
              groupBy: ["date"]
            },
            {
              table: "call",
              name: "success_by_date",
              operations: [
                { operation: "count", column: "id" }
              ],
              timeRange: {
                step: "day",
                start: dateRange.start,
                end: dateRange.end,
                timezone: "UTC"
              },
              groupBy: ["date", "endedReason"]
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

        const performanceData = result.data[0]?.result || []
        const successData = result.data[1]?.result || []

        // Calculate success rates by date
        const successRatesByDate = new Map<string, number>()
        const totalCallsByDate = new Map<string, number>()

        successData.forEach((item: any) => {
          const date = item.date
          const count = item.countId || 0
          const isSuccess = ["customer-ended-call", "assistant-ended-call", "assistant-ended-call-after-message-spoken"].includes(item.endedReason)
          
          if (!totalCallsByDate.has(date)) {
            totalCallsByDate.set(date, 0)
            successRatesByDate.set(date, 0)
          }
          
          totalCallsByDate.set(date, totalCallsByDate.get(date)! + count)
          if (isSuccess) {
            successRatesByDate.set(date, successRatesByDate.get(date)! + count)
          }
        })

        // Transform data for chart
        const chartData: PerformanceData[] = performanceData.map((item: any) => {
          const date = item.date
          const totalCalls = totalCallsByDate.get(date) || 1
          const successCalls = successRatesByDate.get(date) || 0
          
          return {
            date: new Date(date).toLocaleDateString("en-US", { 
              month: "short", 
              day: "numeric" 
            }),
            avgDuration: Math.round((item.avgDuration || 0) / 60), // Convert to minutes
            successRate: Math.round((successCalls / totalCalls) * 100),
            avgCost: parseFloat((item.avgCost || 0).toFixed(2)),
            totalCalls: item.countId || 0
          }
        })

        setData(chartData)
      } catch (err: any) {
        console.error('Performance benchmark fetch error:', err)
        setError(err.message || 'Failed to load performance data')
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
          <p className="text-gray-500">No performance data available for selected period</p>
        </div>
      </div>
    )
  }

  // Calculate averages for benchmarking
  const avgDuration = Math.round(data.reduce((sum, item) => sum + item.avgDuration, 0) / data.length)
  const avgSuccessRate = Math.round(data.reduce((sum, item) => sum + item.successRate, 0) / data.length)
  const avgCost = parseFloat((data.reduce((sum, item) => sum + item.avgCost, 0) / data.length).toFixed(2))

  return (
    <div className="space-y-4">
      {/* View Mode Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode("duration-success")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            viewMode === "duration-success" 
              ? "bg-purple-500 text-white" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Duration vs Success
        </button>
        <button
          onClick={() => setViewMode("cost-trend")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            viewMode === "cost-trend" 
              ? "bg-purple-500 text-white" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Cost Trend
        </button>
        <button
          onClick={() => setViewMode("satisfaction")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            viewMode === "satisfaction" 
              ? "bg-purple-500 text-white" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Satisfaction Trend
        </button>
      </div>

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === "duration-success" ? (
            <ScatterChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxisAny 
                dataKey="avgDuration" 
                name="Duration (min)"
                tick={{ fill: "#6b7280", fontSize: 12 }}
                label={{ value: 'Average Duration (minutes)', position: 'insideBottom', offset: -5 }}
              />
              <YAxisAny 
                dataKey="successRate" 
                name="Success Rate (%)"
                tick={{ fill: "#6b7280", fontSize: 12 }}
                label={{ value: 'Success Rate (%)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                formatter={(value: any, name: string) => [
                  name === "avgDuration" ? `${value} min` : `${value}%`,
                  name === "avgDuration" ? "Avg Duration" : "Success Rate"
                ]}
                labelFormatter={(label: any, payload: any) => {
                  const point = payload?.[0]?.payload
                  return point ? `${point.date} (${point.totalCalls} calls)` : label
                }}
              />
              <Scatter dataKey="successRate" fill="#8b5cf6" />
            </ScatterChart>
          ) : viewMode === "cost-trend" ? (
            <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxisAny 
                dataKey="date" 
                tick={{ fill: "#6b7280", fontSize: 12 }}
              />
              <YAxisAny 
                tick={{ fill: "#6b7280", fontSize: 12 }}
                label={{ value: 'Average Cost ($)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                formatter={(value: any) => [`$${value}`, "Avg Cost per Call"]}
              />
              <Area 
                type="monotone" 
                dataKey="avgCost" 
                stroke="#f59e0b" 
                fill="#fef3c7" 
                strokeWidth={2}
              />
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxisAny 
                dataKey="date" 
                tick={{ fill: "#6b7280", fontSize: 12 }}
              />
              <YAxisAny 
                tick={{ fill: "#6b7280", fontSize: 12 }}
                label={{ value: 'Success Rate (%)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                formatter={(value: any) => [`${value}%`, "Success Rate"]}
              />
              <Line 
                type="monotone" 
                dataKey="successRate" 
                stroke="#10b981" 
                strokeWidth={3}
                dot={{ fill: "#10b981", strokeWidth: 2, r: 4 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Benchmark Stats */}
      <div className="grid grid-cols-3 gap-4 pt-4 border-t">
        <div className="text-center">
          <p className="text-2xl font-bold text-purple-600">{avgDuration}m</p>
          <p className="text-sm text-gray-500">Avg Duration</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">{avgSuccessRate}%</p>
          <p className="text-sm text-gray-500">Avg Success Rate</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-amber-600">${avgCost}</p>
          <p className="text-sm text-gray-500">Avg Cost per Call</p>
        </div>
      </div>

      {/* Performance Insights */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-2">Performance Insights</h4>
        <div className="space-y-1 text-sm text-gray-600">
          {avgSuccessRate > 70 && (
            <p className="text-green-600">✓ Strong success rate performance</p>
          )}
          {avgSuccessRate < 50 && (
            <p className="text-red-600">⚠ Success rate needs improvement</p>
          )}
          {avgDuration > 300 && (
            <p className="text-amber-600">⚠ Calls are running longer than average</p>
          )}
          {avgCost > 5 && (
            <p className="text-red-600">⚠ High cost per call detected</p>
          )}
          {avgCost < 2 && (
            <p className="text-green-600">✓ Cost-efficient call performance</p>
          )}
        </div>
      </div>
    </div>
  )
}
