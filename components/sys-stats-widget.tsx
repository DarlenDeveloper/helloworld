"use client"

import { useState, useEffect } from "react"
import { Activity, TrendingUp, Zap, Clock, Phone, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

interface SystemStats {
  totalCalls: number
  activeCalls: number
  completedCalls: number
  failedCalls: number
  averageDuration: number
  uptime: number
  responseTime: number
  errorRate: number
  concurrentCalls: number
}

interface SysStatsWidgetProps {
  compact?: boolean
  className?: string
}

export function SysStatsWidget({ compact = false, className = "" }: SysStatsWidgetProps) {
  const [stats, setStats] = useState<SystemStats>({
    totalCalls: 0,
    activeCalls: 0,
    completedCalls: 0,
    failedCalls: 0,
    averageDuration: 0,
    uptime: 99.9,
    responseTime: 150,
    errorRate: 0.1,
    concurrentCalls: 0
  })

  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true)
      try {
        await new Promise(resolve => setTimeout(resolve, 1000))

        setStats({
          totalCalls: 1247,
          activeCalls: 3,
          completedCalls: 1189,
          failedCalls: 55,
          averageDuration: 245,
          uptime: 99.9,
          responseTime: 145,
          errorRate: 0.08,
          concurrentCalls: 3
        })
      } catch (error) {
        console.error('Failed to fetch system stats:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <div className="flex items-center justify-center h-16">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (compact) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">System Status</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-green-600 border-green-600">
                {stats.uptime}% Uptime
              </Badge>
              <Badge variant="outline" className="text-blue-600 border-blue-600">
                {stats.activeCalls} Active
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5 text-blue-500" />
          System Statistics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <Phone className="h-6 w-6 text-blue-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-blue-600">{stats.totalCalls}</p>
            <p className="text-xs text-gray-600">Total Calls</p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <Zap className="h-6 w-6 text-green-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-600">{stats.activeCalls}</p>
            <p className="text-xs text-gray-600">Active</p>
          </div>
        </div>

        {/* Performance Bars */}
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Success Rate</span>
              <span className="font-medium">{((stats.completedCalls / stats.totalCalls) * 100).toFixed(1)}%</span>
            </div>
            <Progress value={(stats.completedCalls / stats.totalCalls) * 100} className="h-2" />
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>System Uptime</span>
              <span className="font-medium">{stats.uptime}%</span>
            </div>
            <Progress value={stats.uptime} className="h-2" />
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Response Time</span>
              <span className="font-medium">{stats.responseTime}ms</span>
            </div>
            <Progress value={Math.max(0, 100 - (stats.responseTime / 5))} className="h-2" />
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex justify-between pt-2 border-t">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-gray-600">API: OK</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-gray-600">DB: OK</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-gray-600">Vapi: OK</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
