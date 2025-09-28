"use client"

import { useState, useEffect } from "react"
import { Server, CheckCircle, XCircle, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface ServerStatus {
  name: string
  status: 'online' | 'offline' | 'warning'
  uptime: number
  lastCheck: Date
}

export default function SimpleSystemHealth() {
  const [servers, setServers] = useState<ServerStatus[]>([
    {
      name: "Server 1",
      status: 'online',
      uptime: 99.9,
      lastCheck: new Date()
    },
    {
      name: "Server 2",
      status: 'online',
      uptime: 99.8,
      lastCheck: new Date()
    }
  ])

  useEffect(() => {
    const checkServers = async () => {
      try {
        // Simulate server health checks
        const newServers = servers.map(server => {
          // 95% chance of staying online, 3% warning, 2% offline
          const rand = Math.random()
          let newStatus: 'online' | 'offline' | 'warning' = 'online'

          if (rand < 0.02) {
            newStatus = 'offline'
          } else if (rand < 0.05) {
            newStatus = 'warning'
          }

          return {
            ...server,
            status: newStatus,
            uptime: newStatus === 'online' ? server.uptime : Math.max(0, server.uptime - 0.1),
            lastCheck: new Date()
          }
        })

        setServers(newServers)
      } catch (error) {
        console.error('Server health check failed:', error)
      }
    }

    // Check every 10 seconds
    const interval = setInterval(checkServers, 10000)
    return () => clearInterval(interval)
  }, [servers])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case 'offline':
        return <XCircle className="h-5 w-5 text-red-500" />
      default:
        return <Server className="h-5 w-5 text-gray-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'text-green-600'
      case 'warning':
        return 'text-yellow-600'
      case 'offline':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5 text-blue-500" />
          System Health
        </CardTitle>
        <CardDescription>Server status monitoring</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {servers.map((server, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                {getStatusIcon(server.status)}
                <div>
                  <p className="font-medium">{server.name}</p>
                  <p className="text-sm text-gray-600">
                    Uptime: {server.uptime.toFixed(1)}% • Last check: {server.lastCheck.toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <div className={`text-sm font-medium ${getStatusColor(server.status)}`}>
                {server.status.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
