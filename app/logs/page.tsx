"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Search, Filter, Download, Eye, Calendar, User, Clock, Shield } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

interface LoginLog {
  id: string
  user_id: string
  email: string
  status: "success" | "failed" | "blocked"
  ip_address: string | null
  user_agent: string | null
  location: string | null
  device: string | null
  created_at: string // ISO
}

export default function LogsPage() {
  const supabase = createClient()
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [timeFilter, setTimeFilter] = useState("7days")
  const [selectedLog, setSelectedLog] = useState<LoginLog | null>(null)

  const [logs, setLogs] = useState<LoginLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        await fetchLogs(user.id)

        // subscribe to real-time changes
        const channel = supabase
          .channel("user_login_logs_changes")
          .on("postgres_changes", { event: "*", schema: "public", table: "user_login_logs" }, () => {
            fetchLogs(user.id)
          })
          .subscribe()
        return () => {
          supabase.removeChannel(channel)
        }
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [supabase])

  const fetchLogs = async (userId: string) => {
    // Resolve owners: self + owners where I'm a member
    const owners: string[] = [userId]
    const { data: memberships } = await supabase
      .from("account_users")
      .select("owner_user_id, is_active")
      .eq("member_user_id", userId)
      .eq("is_active", true)
    ;(memberships || []).forEach((m: any) => {
      const oid = String(m?.owner_user_id || "")
      if (oid && !owners.includes(oid)) owners.push(oid)
    })

    const { data, error } = await supabase
      .from("user_login_logs")
      .select("*")
      .in("user_id", owners)
      .order("created_at", { ascending: false })
      .limit(500)

    if (error) {
      console.error("Failed to fetch login logs:", error)
      return
    }
    setLogs((data || []) as LoginLog[])
  }

  const filteredLogs = useMemo(() => {
    const now = new Date()
    const startCutoff = new Date(now)
    if (timeFilter === "1day") startCutoff.setDate(now.getDate() - 1)
    else if (timeFilter === "7days") startCutoff.setDate(now.getDate() - 7)
    else if (timeFilter === "30days") startCutoff.setDate(now.getDate() - 30)
    else if (timeFilter === "90days") startCutoff.setDate(now.getDate() - 90)

    return logs.filter((log) => {
      const matchesSearch =
        log.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.ip_address?.includes(searchTerm) ||
        log.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.device?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesStatus = statusFilter === "all" || log.status === (statusFilter as LoginLog["status"])

      const logTime = new Date(log.created_at)
      const matchesTime = logTime >= startCutoff

      return matchesSearch && matchesStatus && matchesTime
    })
  }, [logs, searchTerm, statusFilter, timeFilter])

  // Metrics derived from filtered logs
  const metrics = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayCount = logs.filter((l) => new Date(l.created_at) >= todayStart).length
    const windowLogs = filteredLogs
    const total = windowLogs.length || 1
    const successCount = windowLogs.filter((l) => l.status === "success").length
    const failedLastDay = logs.filter((l) => {
      const t = new Date(l.created_at)
      const cutoff = new Date(now)
      cutoff.setDate(now.getDate() - 1)
      return l.status === "failed" && t >= cutoff
    }).length

    const successRate = Math.round((successCount / total) * 1000) / 10 // one decimal
    // Active sessions is not tracked; approximate with count of success in last 60 minutes
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const activeSessions = logs.filter((l) => l.status === "success" && new Date(l.created_at) >= oneHourAgo).length

    return { todayCount, successRate, failedLastDay, activeSessions }
  }, [logs, filteredLogs])

  const getStatusColor = (status: LoginLog["status"]) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-700 border-green-200"
      case "failed":
        return "bg-red-100 text-red-700 border-red-200"
      case "blocked":
        return "bg-orange-100 text-orange-700 border-orange-200"
      default:
        return "bg-gray-100 text-gray-700 border-gray-200"
    }
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "Low":
      case "low":
        return "text-green-600"
      case "Medium":
      case "medium":
        return "text-yellow-600"
      case "High":
      case "high":
        return "text-red-600"
      default:
        return "text-gray-600"
    }
  }

  const exportCSV = () => {
    const rows = [
      ["email", "status", "created_at", "ip_address", "location", "device"],
      ...filteredLogs.map((l) => [
        l.email,
        l.status,
        new Date(l.created_at).toISOString(),
        l.ip_address || "",
        l.location || "",
        l.device || "",
      ]),
    ]
    const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "user_login_logs.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="p-6 ml-16">
        <div className="text-gray-600">Loading logs...</div>
      </div>
    )
  }

  return (
    <div className="p-6 ml-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-black">User Login Logs</h1>
          <p className="text-gray-600 mt-1">Monitor and track user authentication events</p>
        </div>
        <Button className="bg-teal-500 hover:bg-teal-600 text-white" onClick={exportCSV}>
          <Download className="h-4 w-4 mr-2" />
          Export Logs
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
              <User className="h-4 w-4 mr-2" />
              Total Logins Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-black">{metrics.todayCount}</div>
            <p className="text-xs text-green-600 mt-1">Updated live</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
              <Shield className="h-4 w-4 mr-2" />
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-black">{metrics.successRate}%</div>
            <p className="text-xs text-gray-600 mt-1">Within selected range</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
              <Clock className="h-4 w-4 mr-2" />
              Failed Attempts (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-black">{metrics.failedLastDay}</div>
            <p className="text-xs text-red-600 mt-1">Past 24 hours</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
              <Calendar className="h-4 w-4 mr-2" />
              Active Sessions (~1h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-black">{metrics.activeSessions}</div>
            <p className="text-xs text-gray-600 mt-1">Approximate</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card className="bg-white border-gray-200 shadow-sm mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by email, IP, location, or device..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-gray-2 00"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 border-gray-200">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>
            <Select value={timeFilter} onValueChange={setTimeFilter}>
              <SelectTrigger className="w-40 border-gray-200">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1day">Last 24 hours</SelectItem>
                <SelectItem value="7days">Last 7 days</SelectItem>
                <SelectItem value="30days">Last 30 days</SelectItem>
                <SelectItem value="90days">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="border-gray-200 text-black hover:bg-gray-50 bg-transparent">
              <Filter className="h-4 w-4 mr-2" />
              More Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-medium text-black">Login Events</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-black font-medium">User</TableHead>
                <TableHead className="text-black font-medium">Status</TableHead>
                <TableHead className="text-black font-medium">Timestamp</TableHead>
                <TableHead className="text-black font-medium">IP Address</TableHead>
                <TableHead className="text-black font-medium">Location</TableHead>
                <TableHead className="text-black font-medium">Device</TableHead>
                <TableHead className="text-black font-medium">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id} className="hover:bg-gray-50">
                  <TableCell>
                    <div>
                      <div className="font-medium text-black">{log.email}</div>
                      <div className="text-sm text-gray-500">User ID: {log.user_id}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStatusColor(log.status)}>
                      {log.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-black font-mono text-sm">
                    {new Date(log.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-black font-mono">{log.ip_address || "-"}</TableCell>
                  <TableCell className="text-black">{log.location || "-"}</TableCell>
                  <TableCell className="text-black text-sm">{log.device || "-"}</TableCell>
                  <TableCell>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-teal-600 hover:text-teal-700 hover:bg-teal-50"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Login Event Details</DialogTitle>
                        </DialogHeader>
                        {selectedLog && (
                          <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-sm font-medium text-gray-600">User:</label>
                                <p className="font-medium">{selectedLog.email}</p>
                                <p className="text-sm text-gray-500">User ID: {selectedLog.user_id}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-gray-600">Status:</label>
                                <div className="mt-1">
                                  <Badge variant="outline" className={getStatusColor(selectedLog.status)}>
                                    {selectedLog.status}
                                  </Badge>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-sm font-medium text-gray-600">Timestamp:</label>
                                <p className="font-mono">{new Date(selectedLog.created_at).toLocaleString()}</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-sm font-medium text-gray-600">IP Address:</label>
                                <p className="font-mono">{selectedLog.ip_address || "-"}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-gray-600">Location:</label>
                                <p>{selectedLog.location || "-"}</p>
                              </div>
                            </div>

                            <div>
                              <label className="text-sm font-medium text-gray-600">Device & Browser:</label>
                              <p>{selectedLog.device || "-"}</p>
                            </div>

                            <div className="border-t pt-4">
                              <label className="text-sm font-medium text-gray-600">User Agent:</label>
                              <p className="text-sm text-gray-700 font-mono break-all mt-1">
                                {selectedLog.user_agent || "-"}
                              </p>
                            </div>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
