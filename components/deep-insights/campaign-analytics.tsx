"use client"

import { useEffect, useState } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts"
import { createClient } from "@/lib/supabase/client"
import { VapiAnalyticsRequest } from "@/lib/api/vapi"

// Recharts type compatibility shim for React 19/TS 5
const XAxisAny: any = XAxis
const YAxisAny: any = YAxis

interface CampaignData {
  batchName: string
  totalCalls: number
  successfulCalls: number
  conversionRate: number
  avgDuration: number
  totalCost: number
  contactCount: number
}

interface CampaignAnalyticsProps {
  dateRange: {
    start: string
    end: string
  }
}

export function CampaignAnalytics({ dateRange }: CampaignAnalyticsProps) {
  const [data, setData] = useState<CampaignData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"performance" | "conversion" | "cost">("performance")

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const supabase = createClient()
        
        // Get user for RLS
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          throw new Error('User not authenticated')
        }

        // Resolve owners: self + owners where I'm an active member
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

        // Fetch batch data from Supabase
        const { data: batches, error: batchError } = await supabase
          .from("contact_batches")
          .select("id, name, contact_count, created_at")
          .in("user_id", owners)
          .gte("created_at", dateRange.start)
          .lte("created_at", dateRange.end)

        if (batchError) {
          throw new Error(batchError.message)
        }

        if (!batches || batches.length === 0) {
          setData([])
          return
        }

        // For each batch, get Vapi analytics data
        const campaignPromises = batches.map(async (batch: any) => {
          try {
            const analyticsRequest: VapiAnalyticsRequest = {
              queries: [
                {
                  table: "call",
                  name: "batch_performance",
                  operations: [
                    { operation: "count", column: "id" },
                    { operation: "avg", column: "duration" },
                    { operation: "sum", column: "cost" }
                  ],
                  timeRange: {
                    start: dateRange.start,
                    end: dateRange.end,
                    timezone: "UTC"
                  },
                  groupBy: ["endedReason"],
                  filters: {
                    // Note: This assumes batch info is somehow linked to calls
                    // You may need to adjust this based on your actual data structure
                  }
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
              console.warn(`Failed to fetch analytics for batch ${batch.id}`)
              return null
            }

            const result = await response.json()
            
            if (!result.success) {
              console.warn(`Analytics error for batch ${batch.id}:`, result.error)
              return null
            }

            const callData = result.data[0]?.result || []
            
            // Calculate metrics
            const totalCalls = callData.reduce((sum: number, item: any) => sum + (item.countId || 0), 0)
            const successfulCalls = callData
              .filter((item: any) => ["customer-ended-call", "assistant-ended-call", "assistant-ended-call-after-message-spoken"].includes(item.endedReason))
              .reduce((sum: number, item: any) => sum + (item.countId || 0), 0)
            
            const avgDuration = callData.length > 0 
              ? callData.reduce((sum: number, item: any) => sum + (item.avgDuration || 0), 0) / callData.length
              : 0
            
            const totalCost = callData.reduce((sum: number, item: any) => sum + (item.sumCost || 0), 0)

            return {
              batchName: batch.name || `Batch ${batch.id.slice(0, 8)}`,
              totalCalls,
              successfulCalls,
              conversionRate: totalCalls > 0 ? Math.round((successfulCalls / totalCalls) * 100) : 0,
              avgDuration: Math.round(avgDuration / 60), // Convert to minutes
              totalCost: parseFloat(totalCost.toFixed(2)),
              contactCount: batch.contact_count || 0
            }
          } catch (err) {
            console.warn(`Error processing batch ${batch.id}:`, err)
            return null
          }
        })

        const campaignResults = await Promise.all(campaignPromises)
        const validCampaigns = campaignResults.filter(Boolean) as CampaignData[]
        
        // Sort by total calls descending
        validCampaigns.sort((a, b) => b.totalCalls - a.totalCalls)
        
        setData(validCampaigns)
      } catch (err: any) {
        console.error('Campaign analytics fetch error:', err)
        setError(err.message || 'Failed to load campaign data')
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
          <p className="text-gray-500">No campaign data available for selected period</p>
        </div>
      </div>
    )
  }

  const getDataKey = () => {
    switch (viewMode) {
      case "conversion": return "conversionRate"
      case "cost": return "totalCost"
      default: return "totalCalls"
    }
  }

  const getLabel = () => {
    switch (viewMode) {
      case "conversion": return "Conversion Rate (%)"
      case "cost": return "Total Cost ($)"
      default: return "Total Calls"
    }
  }

  const getColor = () => {
    switch (viewMode) {
      case "conversion": return "#10b981"
      case "cost": return "#f59e0b"
      default: return "#14b8a6"
    }
  }

  // Calculate summary stats
  const totalCalls = data.reduce((sum, item) => sum + item.totalCalls, 0)
  const totalSuccessful = data.reduce((sum, item) => sum + item.successfulCalls, 0)
  const avgConversion = data.length > 0 ? Math.round(data.reduce((sum, item) => sum + item.conversionRate, 0) / data.length) : 0
  const totalCost = data.reduce((sum, item) => sum + item.totalCost, 0)

  return (
    <div className="space-y-4">
      {/* View Mode Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode("performance")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            viewMode === "performance" 
              ? "bg-teal-500 text-white" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Call Volume
        </button>
        <button
          onClick={() => setViewMode("conversion")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            viewMode === "conversion" 
              ? "bg-teal-500 text-white" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Conversion Rate
        </button>
        <button
          onClick={() => setViewMode("cost")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            viewMode === "cost" 
              ? "bg-teal-500 text-white" 
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Cost Analysis
        </button>
      </div>

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.slice(0, 10)} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxisAny 
              dataKey="batchName" 
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
              formatter={(value: any, name: any, props: any) => {
                const item = props.payload
                return [
                  viewMode === "cost" ? `$${value}` : value,
                  getLabel(),
                  `${item.successfulCalls}/${item.totalCalls} successful (${item.conversionRate}%)`
                ]
              }}
              labelFormatter={(label: any, payload: any) => {
                const item = payload?.[0]?.payload
                return item ? `${item.batchName} (${item.contactCount} contacts)` : label
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
      <div className="grid grid-cols-4 gap-4 pt-4 border-t">
        <div className="text-center">
          <p className="text-2xl font-bold text-teal-600">{data.length}</p>
          <p className="text-sm text-gray-500">Active Campaigns</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-600">{totalCalls}</p>
          <p className="text-sm text-gray-500">Total Calls</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">{avgConversion}%</p>
          <p className="text-sm text-gray-500">Avg Conversion</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-amber-600">${totalCost.toFixed(2)}</p>
          <p className="text-sm text-gray-500">Total Cost</p>
        </div>
      </div>

      {/* Top Performers */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-3">Top Performing Campaigns</h4>
        <div className="space-y-2">
          {data.slice(0, 3).map((item, index) => (
            <div key={index} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{item.batchName}</p>
                <p className="text-xs text-gray-500">
                  {item.totalCalls} calls • {item.contactCount} contacts
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-green-600">{item.conversionRate}%</p>
                <p className="text-xs text-gray-500">${item.totalCost.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
