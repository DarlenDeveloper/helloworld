"use client"

import { useState, useEffect } from "react"
import { Phone, BarChart3, BarChart, Clock } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"

interface SystemStats {
  totalCalls: number
  activeCalls: number
  completedCalls: number
  failedCalls: number
  uptime: number
  responseTime: number
  errorRate: number
}

export default function SystemStatsCard() {
  const [stats, setStats] = useState<SystemStats>({
    totalCalls: 1247,
    activeCalls: 3,
    completedCalls: 1189,
    failedCalls: 55,
    uptime: 99.9,
    responseTime: 145,
    errorRate: 0.08
  })

  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(new Date())

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true)
      try {
        await new Promise(resolve => setTimeout(resolve, 500))

        // Generate realistic real-time data
        const baseCalls = 1247
        const newCalls = Math.floor(Math.random() * 3) // 0-2 new calls per update
        const totalCalls = baseCalls + newCalls

        const activeCalls = Math.floor(Math.random() * 8) + 1 // 1-8 active calls
        const completedCalls = Math.floor(totalCalls * (0.85 + Math.random() * 0.1)) // 85-95% success
        const failedCalls = totalCalls - completedCalls

        const uptime = 99.9 + (Math.random() * 0.08 - 0.04) // 99.86% to 99.98%
        const responseTime = 145 + Math.floor(Math.random() * 40 - 20) // 125-165ms
        const errorRate = 0.05 + (Math.random() * 0.02) // 0.05% to 0.07%

        setStats({
          totalCalls,
          activeCalls,
          completedCalls,
          failedCalls,
          uptime,
          responseTime,
          errorRate
        })

        setLastUpdate(new Date())
      } catch (error) {
        console.error('Failed to fetch system stats:', error)
      } finally {
        setIsLoading(false)
      }
    }

    // Initial load
    fetchStats()

    // Update every 5 seconds for real-time feel
    const interval = setInterval(fetchStats, 5000)
    return () => clearInterval(interval)
  }, [])

  const successRate = stats.totalCalls > 0 ? (stats.completedCalls / stats.totalCalls) * 100 : 0
  const renewalDate = new Date()
  renewalDate.setMonth(renewalDate.getMonth() + 1)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-teal-500" />
            System Statistics
          </CardTitle>
          <CardDescription>Real-time system performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-teal-500" />
          System Statistics
        </CardTitle>
        <CardDescription>Real-time system performance metrics</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>System Health</span>
            <span className="font-medium">{stats.uptime.toFixed(1)}% Uptime</span>
          </div>
          <Progress value={stats.uptime} className="h-3" />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Response: {stats.responseTime}ms</span>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>Updated: {lastUpdate.toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="flex items-center gap-2 bg-transparent"
          >
            <BarChart3 className="h-4 w-4" />
            {stats.totalCalls} Total
          </Button>
          <Button
            variant="outline"
            className="flex items-center gap-2 bg-transparent"
          >
            <BarChart className="h-4 w-4" />
            {stats.activeCalls} Active
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Success Rate</span>
            <span className="font-medium">{successRate.toFixed(1)}%</span>
          </div>
          <Progress value={successRate} className="h-2" />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Error Rate</span>
            <span className="font-medium">{(stats.errorRate * 100).toFixed(1)}%</span>
          </div>
          <Progress value={stats.errorRate * 100} className="h-2" />
        </div>
      </CardContent>
    </Card>
  )
}
