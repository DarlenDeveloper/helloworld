"use client"

import { useState } from "react"
import { Search, Filter, Download, Eye, Calendar, User, Clock, Shield } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export default function LogsPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [timeFilter, setTimeFilter] = useState("7days")
  const [selectedLog, setSelectedLog] = useState(null)

  // Mock login logs data
  const loginLogs = [
    {
      id: "LOG-001",
      user: "john.doe@company.com",
      userName: "John Doe",
      status: "Success",
      timestamp: "2024-12-15 14:32:15",
      ipAddress: "192.168.1.100",
      location: "New York, NY",
      device: "Chrome 120.0 on Windows 10",
      sessionDuration: "2h 45m",
      details: {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        loginMethod: "Email & Password",
        mfaUsed: true,
        riskScore: "Low",
      },
    },
    {
      id: "LOG-002",
      user: "sarah.wilson@company.com",
      userName: "Sarah Wilson",
      status: "Failed",
      timestamp: "2024-12-15 13:45:22",
      ipAddress: "203.0.113.45",
      location: "Los Angeles, CA",
      device: "Safari 17.0 on macOS",
      sessionDuration: "N/A",
      details: {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        loginMethod: "Email & Password",
        mfaUsed: false,
        riskScore: "Medium",
        failureReason: "Invalid password",
      },
    },
    {
      id: "LOG-003",
      user: "mike.johnson@company.com",
      userName: "Mike Johnson",
      status: "Success",
      timestamp: "2024-12-15 12:18:33",
      ipAddress: "198.51.100.22",
      location: "Chicago, IL",
      device: "Firefox 121.0 on Ubuntu",
      sessionDuration: "1h 23m",
      details: {
        userAgent: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
        loginMethod: "SSO (Google)",
        mfaUsed: true,
        riskScore: "Low",
      },
    },
    {
      id: "LOG-004",
      user: "admin@company.com",
      userName: "System Admin",
      status: "Locked",
      timestamp: "2024-12-15 11:55:41",
      ipAddress: "192.168.1.50",
      location: "New York, NY",
      device: "Chrome 120.0 on Windows 11",
      sessionDuration: "N/A",
      details: {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        loginMethod: "Email & Password",
        mfaUsed: false,
        riskScore: "High",
        failureReason: "Account locked due to multiple failed attempts",
      },
    },
    {
      id: "LOG-005",
      user: "emma.davis@company.com",
      userName: "Emma Davis",
      status: "Success",
      timestamp: "2024-12-15 10:30:12",
      ipAddress: "172.16.0.15",
      location: "Seattle, WA",
      device: "Edge 120.0 on Windows 10",
      sessionDuration: "3h 12m",
      details: {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
        loginMethod: "Email & Password",
        mfaUsed: true,
        riskScore: "Low",
      },
    },
  ]

  const filteredLogs = loginLogs.filter((log) => {
    const matchesSearch =
      log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.ipAddress.includes(searchTerm)
    const matchesStatus = statusFilter === "all" || log.status.toLowerCase() === statusFilter.toLowerCase()
    return matchesSearch && matchesStatus
  })

  const getStatusColor = (status) => {
    switch (status) {
      case "Success":
        return "bg-green-100 text-green-700 border-green-200"
      case "Failed":
        return "bg-red-100 text-red-700 border-red-200"
      case "Locked":
        return "bg-orange-100 text-orange-700 border-orange-200"
      default:
        return "bg-gray-100 text-gray-700 border-gray-200"
    }
  }

  const getRiskColor = (risk) => {
    switch (risk) {
      case "Low":
        return "text-green-600"
      case "Medium":
        return "text-yellow-600"
      case "High":
        return "text-red-600"
      default:
        return "text-gray-600"
    }
  }

  return (
    <div className="p-6 ml-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-black">User Login Logs</h1>
          <p className="text-gray-600 mt-1">Monitor and track user authentication events</p>
        </div>
        <Button className="bg-teal-500 hover:bg-teal-600 text-white">
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
            <div className="text-2xl font-bold text-black">247</div>
            <p className="text-xs text-green-600 mt-1">+12% from yesterday</p>
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
            <div className="text-2xl font-bold text-black">94.2%</div>
            <p className="text-xs text-green-600 mt-1">+2.1% from last week</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
              <Clock className="h-4 w-4 mr-2" />
              Failed Attempts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-black">14</div>
            <p className="text-xs text-red-600 mt-1">-8% from yesterday</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
              <Calendar className="h-4 w-4 mr-2" />
              Active Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-black">89</div>
            <p className="text-xs text-gray-600 mt-1">Currently online</p>
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
                  placeholder="Search by email, name, or IP address..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-gray-200"
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
                <SelectItem value="locked">Locked</SelectItem>
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
                <TableHead className="text-black font-medium">Session</TableHead>
                <TableHead className="text-black font-medium">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id} className="hover:bg-gray-50">
                  <TableCell>
                    <div>
                      <div className="font-medium text-black">{log.userName}</div>
                      <div className="text-sm text-gray-500">{log.user}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStatusColor(log.status)}>
                      {log.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-black font-mono text-sm">{log.timestamp}</TableCell>
                  <TableCell className="text-black font-mono">{log.ipAddress}</TableCell>
                  <TableCell className="text-black">{log.location}</TableCell>
                  <TableCell className="text-black text-sm">{log.device}</TableCell>
                  <TableCell className="text-black">{log.sessionDuration}</TableCell>
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
                                <p className="font-medium">{selectedLog.userName}</p>
                                <p className="text-sm text-gray-500">{selectedLog.user}</p>
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
                                <p className="font-mono">{selectedLog.timestamp}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-gray-600">Session Duration:</label>
                                <p>{selectedLog.sessionDuration}</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-sm font-medium text-gray-600">IP Address:</label>
                                <p className="font-mono">{selectedLog.ipAddress}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-gray-600">Location:</label>
                                <p>{selectedLog.location}</p>
                              </div>
                            </div>

                            <div>
                              <label className="text-sm font-medium text-gray-600">Device & Browser:</label>
                              <p>{selectedLog.device}</p>
                            </div>

                            <div className="border-t pt-4">
                              <h4 className="font-medium text-black mb-3">Security Details</h4>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="text-sm font-medium text-gray-600">Login Method:</label>
                                  <p>{selectedLog.details.loginMethod}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-600">MFA Used:</label>
                                  <p>{selectedLog.details.mfaUsed ? "Yes" : "No"}</p>
                                </div>
                              </div>
                              <div className="mt-4">
                                <label className="text-sm font-medium text-gray-600">Risk Score:</label>
                                <p className={`font-medium ${getRiskColor(selectedLog.details.riskScore)}`}>
                                  {selectedLog.details.riskScore}
                                </p>
                              </div>
                              {selectedLog.details.failureReason && (
                                <div className="mt-4">
                                  <label className="text-sm font-medium text-gray-600">Failure Reason:</label>
                                  <p className="text-red-600">{selectedLog.details.failureReason}</p>
                                </div>
                              )}
                            </div>

                            <div className="border-t pt-4">
                              <label className="text-sm font-medium text-gray-600">User Agent:</label>
                              <p className="text-sm text-gray-700 font-mono break-all mt-1">
                                {selectedLog.details.userAgent}
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
