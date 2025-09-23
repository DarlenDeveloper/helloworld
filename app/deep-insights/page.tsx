"use client"

import { useEffect, useState } from "react"
import { Calendar, Phone, Clock, DollarSign, BarChart3, Users, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

interface Call {
  id: string
  type: string
  status: string
  endedReason?: string
  duration?: number
  cost?: number
  createdAt: string
  startedAt?: string
  endedAt?: string
  customer?: {
    number?: string
    name?: string
  }
  assistant?: {
    name?: string
  }
  analysis?: {
    summary?: string
    successEvaluation?: string
  }
}

interface Metrics {
  totalCalls: number
  avgDuration: number
  totalCost: number
  successRate: number
}

export default function DeepInsightsPage() {
  const [calls, setCalls] = useState<Call[]>([])
  const [metrics, setMetrics] = useState<Metrics>({ totalCalls: 0, avgDuration: 0, totalCost: 0, successRate: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  })

  const fetchCalls = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams({
        createdAtGte: new Date(dateRange.start).toISOString(),
        createdAtLte: new Date(dateRange.end + 'T23:59:59').toISOString(),
        limit: '100'
      })
      
      const response = await fetch(`/api/vapi/calls?${params}`)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch calls')
      }
      
      const callsData = result.data || []
      setCalls(callsData)
      
      // Calculate metrics
      const totalCalls = callsData.length
      const avgDuration = totalCalls > 0 ? callsData.reduce((sum: number, call: Call) => sum + (call.duration || 0), 0) / totalCalls : 0
      const totalCost = callsData.reduce((sum: number, call: Call) => sum + (call.cost || 0), 0)
      const successfulCalls = callsData.filter((call: Call) => 
        ['customer-ended-call', 'assistant-ended-call'].includes(call.endedReason || '')
      ).length
      const successRate = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0
      
      setMetrics({
        totalCalls,
        avgDuration: Math.round(avgDuration / 60), // Convert to minutes
        totalCost: parseFloat(totalCost.toFixed(2)),
        successRate: Math.round(successRate)
      })
      
    } catch (err: any) {
      console.error('Fetch calls error:', err)
      setError(err.message || 'Failed to load calls')
    } finally {
      setLoading(false)
    }
  }
  
  useEffect(() => {
    fetchCalls()
  }, [dateRange])
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ended': return 'bg-green-100 text-green-800'
      case 'in-progress': return 'bg-blue-100 text-blue-800'
      case 'queued': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }
  
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0s'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  }
  
  const filteredCalls = calls.filter(call => 
    !searchTerm || 
    call.customer?.number?.includes(searchTerm) ||
    call.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    call.id.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="ml-20 p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Call Analytics</h1>
        <p className="text-gray-600">Monitor and analyze your Vapi call performance</p>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex gap-2">
          <Input
            type="date"
            value={dateRange.start}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="w-40"
          />
          <Input
            type="date"
            value={dateRange.end}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="w-40"
          />
        </div>
        <div className="flex-1 max-w-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search calls..."
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Button onClick={fetchCalls} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Calls</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.totalCalls}</p>
              </div>
              <Phone className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Duration</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.avgDuration}m</p>
              </div>
              <Clock className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Cost</p>
                <p className="text-2xl font-bold text-gray-900">${metrics.totalCost}</p>
              </div>
              <DollarSign className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Success Rate</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.successRate}%</p>
              </div>
              <BarChart3 className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calls Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Recent Calls</span>
            <Badge variant="secondary">{filteredCalls.length} calls</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-center py-8">
              <p className="text-red-500 mb-2">Error loading data</p>
              <p className="text-sm text-gray-500">{error}</p>
              <Button onClick={fetchCalls} className="mt-4">Try Again</Button>
            </div>
          ) : loading ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Loading calls...</p>
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="text-center py-8">
              <Phone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No calls found for the selected period</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Call ID</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Customer</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Duration</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Cost</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">End Reason</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCalls.map((call) => (
                    <tr key={call.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {call.id.slice(0, 8)}...
                        </code>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-gray-900">
                            {call.customer?.name || 'Unknown'}
                          </p>
                          <p className="text-sm text-gray-500">
                            {call.customer?.number || 'N/A'}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={getStatusColor(call.status)}>
                          {call.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-gray-900">
                        {formatDuration(call.duration)}
                      </td>
                      <td className="py-3 px-4 text-gray-900">
                        ${(call.cost || 0).toFixed(3)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-600">
                          {call.endedReason?.replace(/-/g, ' ') || 'N/A'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">
                        {new Date(call.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
