"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Phone, Clock, BarChart3, Search, ChevronsLeft, ChevronsRight } from "lucide-react"
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
  successRate: number
}

export default function DeepInsightsPage() {
  const [calls, setCalls] = useState<Call[]>([])
  const [allCalls, setAllCalls] = useState<Call[]>([])
  const [metrics, setMetrics] = useState<Metrics>({ totalCalls: 0, avgDuration: 0, successRate: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(0)
  const CALLS_PER_PAGE = 50

  const fetchCalls = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch all calls once - no date filters and no offset
      const response = await fetch(`/api/vapi/calls`)
      
      // Attempt to parse JSON regardless of status to surface useful errors
      let result: any = null
      try {
        result = await response.json()
      } catch {
        // ignore JSON parse errors here; we'll fall back to status text
      }
      
      if (!response.ok || !result?.success) {
        const fallback = !response.ok ? `HTTP ${response.status}` : 'Failed to fetch calls'
        const message = result?.error || fallback
        throw new Error(message)
      }
      
      const callsData = result.data || []
      // Replace data and show first page
      setAllCalls(callsData)
      setCurrentPage(0)
      setCalls(callsData.slice(0, CALLS_PER_PAGE))
      
      // Calculate metrics from all fetched data
      const allData = callsData
      const totalCalls = allData.length
      const avgDuration = totalCalls > 0 ? allData.reduce((sum: number, call: Call) => sum + getDurationSeconds(call), 0) / totalCalls : 0
      const successfulCalls = allData.filter((call: Call) => 
        ['customer-ended-call', 'assistant-ended-call'].includes(call.endedReason || '')
      ).length
      const successRate = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0
      
      setMetrics({
        totalCalls,
        avgDuration: Math.round(avgDuration / 60), // Convert to minutes
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
  }, [])
  
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

  // Prefer explicit duration; otherwise compute from startedAt/endedAt
  const getDurationSeconds = (call: Call): number => {
    if (typeof call.duration === 'number' && call.duration > 0) return Math.round(call.duration)
    if (call.startedAt && call.endedAt) {
      const start = new Date(call.startedAt).getTime()
      const end = new Date(call.endedAt).getTime()
      const delta = Math.max(0, Math.floor((end - start) / 1000))
      return delta
    }
    return 0
  }

  const formatEndedReason = (endedReason?: string) => {
    if (!endedReason) return 'N/A'
    if (/error/i.test(endedReason)) return 'null'
    return endedReason.replace(/-/g, ' ')
  }
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    const start = page * CALLS_PER_PAGE
    const end = start + CALLS_PER_PAGE
    setCalls(allCalls.slice(start, end))
  }
  
  const filteredCalls = calls.filter(call => 
    !searchTerm || 
    call.customer?.number?.includes(searchTerm) ||
    call.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    call.id.toLowerCase().includes(searchTerm.toLowerCase())
  )
  
  const totalPages = Math.ceil(allCalls.length / CALLS_PER_PAGE)

  return (
    <div className="ml-20 p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Call Analytics</h1>
        <p className="text-gray-600">Monitor and analyze your Vapi call performance</p>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1 max-w-md">
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
        <div className="flex gap-2">
          <Button onClick={() => fetchCalls()} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
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
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                Showing {filteredCalls.length} of {allCalls.length} calls
              </Badge>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePageChange(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-2">
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePageChange(Math.min(totalPages - 1, currentPage + 1))}
                    disabled={currentPage === totalPages - 1}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-center py-8">
              <p className="text-red-500 mb-2">Error loading data</p>
              <p className="text-sm text-gray-500">{error}</p>
              <Button onClick={() => fetchCalls()} className="mt-4">Try Again</Button>
            </div>
          ) : loading ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Loading calls...</p>
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="text-center py-8">
              <Phone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No calls found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Call ID</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Customer</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Duration</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Type</th>
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
                          {formatDuration(getDurationSeconds(call))}
                        </td>
                        <td className="py-3 px-4 text-gray-900">
                          {call.type || 'N/A'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-gray-600">
                            {formatEndedReason(call.endedReason)}
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

              {/* Bottom Pagination */}
              {totalPages > 1 && allCalls.length > 0 && (
                <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePageChange(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0}
                  >
                    <ChevronsLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum = i
                      if (totalPages > 5) {
                        if (currentPage < 3) {
                          pageNum = i
                        } else if (currentPage > totalPages - 3) {
                          pageNum = totalPages - 5 + i
                        } else {
                          pageNum = currentPage - 2 + i
                        }
                      }
                      return (
                        <Button
                          key={pageNum}
                          size="sm"
                          variant={currentPage === pageNum ? "default" : "outline"}
                          onClick={() => handlePageChange(pageNum)}
                          className="w-8 h-8 p-0"
                        >
                          {pageNum + 1}
                        </Button>
                      )
                    })}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePageChange(Math.min(totalPages - 1, currentPage + 1))}
                    disabled={currentPage === totalPages - 1}
                  >
                    Next
                    <ChevronsRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
