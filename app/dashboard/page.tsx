"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Filter, User, LogOut, Plus, Eye } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AgentPerformanceChart } from "@/components/agent-performance-chart"

export default function Dashboard() {
  const [callType, setCallType] = useState("inbound")
  const [selectedCall, setSelectedCall] = useState(null)
  const [user, setUser] = useState(null)
  const [calls, setCalls] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/login")
        return
      }
      setUser(user)
      await fetchData(user.id)
      setLoading(false)
    }

    checkAuth()
  }, [router, supabase])

  const fetchData = async (userId: string) => {
    try {
      // Fetch calls
      const { data: callsData, error: callsError } = await supabase
        .from("calls")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10)

      if (callsError) {
        console.error("Error fetching calls:", callsError)
      } else {
        setCalls(callsData || [])
      }

      // Fetch campaigns
      const { data: campaignsData, error: campaignsError } = await supabase
        .from("campaigns")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

      if (campaignsError) {
        console.error("Error fetching campaigns:", campaignsError)
      } else {
        setCampaigns(campaignsData || [])
      }
    } catch (error) {
      console.error("Error fetching data:", error)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  const recentCalls = {
    inbound: calls
      .filter((call) => call.call_type === "inbound")
      .slice(0, 3)
      .map((call) => ({
        status: call.status === "completed" ? "Resolved" : call.status === "missed" ? "Not Resolved" : "In Progress",
        contact: call.customer_phone,
        dateTime: new Date(call.created_at).toLocaleString(),
        statusColor:
          call.status === "completed" ? "bg-green-500" : call.status === "missed" ? "bg-red-500" : "bg-yellow-500",
        summary: call.notes || "No summary available",
      })) || [
      {
        status: "Resolved",
        contact: "+1 (555) 123-4567",
        dateTime: "Dec 15, 2024 14:32",
        statusColor: "bg-green-500",
        summary:
          "Customer inquiry about refund policy. Agent provided detailed explanation and processed refund request successfully.",
      },
      {
        status: "Not Resolved",
        contact: "+1 (555) 987-6543",
        dateTime: "Dec 15, 2024 13:45",
        statusColor: "bg-red-500",
        summary: "Technical support issue requiring escalation to engineering team. Follow-up scheduled for tomorrow.",
      },
      {
        status: "Forwarded",
        contact: "+1 (555) 456-7890",
        dateTime: "Dec 15, 2024 12:18",
        statusColor: "bg-yellow-500",
        summary: "Billing inquiry forwarded to accounting department. Customer will receive callback within 24 hours.",
      },
    ],
    outbound: calls
      .filter((call) => call.call_type === "outbound")
      .slice(0, 3)
      .map((call) => ({
        status: call.status === "completed" ? "Follow Up" : call.status === "missed" ? "Not Answered" : "In Progress",
        contact: call.customer_phone,
        dateTime: new Date(call.created_at).toLocaleString(),
        statusColor:
          call.status === "completed" ? "bg-teal-500" : call.status === "missed" ? "bg-orange-500" : "bg-gray-500",
        summary: call.notes || "No summary available",
      })) || [
      {
        status: "Follow Up",
        contact: "+1 (555) 234-5678",
        dateTime: "Dec 15, 2024 15:20",
        statusColor: "bg-teal-500",
        summary:
          "Marketing campaign follow-up. Customer showed interest in premium package. Scheduled demo for next week.",
      },
      {
        status: "Not Interested",
        contact: "+1 (555) 345-6789",
        dateTime: "Dec 15, 2024 14:55",
        statusColor: "bg-gray-500",
        summary: "Cold outreach for new service offering. Customer politely declined and requested no further contact.",
      },
      {
        status: "Not Answered",
        contact: "+1 (555) 567-8901",
        dateTime: "Dec 15, 2024 14:10",
        statusColor: "bg-orange-500",
        summary: "Attempted callback for previous inquiry. No answer, voicemail left. Will retry tomorrow.",
      },
    ],
  }

  return (
    <div className="p-6 ml-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-black">Dashboard</h1>
        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-10 h-10 bg-teal-500 rounded-full flex items-center justify-center hover:bg-teal-600"
              >
                <span className="text-white font-medium">{user?.email?.charAt(0).toUpperCase() || "A"}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem className="cursor-pointer">
                <User className="h-4 w-4 mr-2" />
                User Settings
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer text-red-600" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Remaining Minutes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl font-bold text-black">2,847</span>
              <Button size="sm" className="bg-teal-500 hover:bg-teal-600 text-white">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-teal-500 h-2 rounded-full" style={{ width: "68%" }}></div>
            </div>
            <p className="text-xs text-gray-500 mt-1">68% remaining</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-gray-600">Outbound Calls</CardTitle>
            <Select defaultValue="1week">
              <SelectTrigger className="w-20 h-6 text-xs border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="1month">1 Month</SelectItem>
                <SelectItem value="1week">1 Week</SelectItem>
                <SelectItem value="today">Today</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-20">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="2"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#14b8a6"
                    strokeWidth="2"
                    strokeDasharray="45, 100"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeDasharray="30, 100"
                    strokeDashoffset="-45"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2"
                    strokeDasharray="25, 100"
                    strokeDashoffset="-75"
                  />
                </svg>
              </div>
            </div>
            <div className="text-xs space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                  <span>Follow Up</span>
                </div>
                <span>45%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span>Not Interested</span>
                </div>
                <span>30%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span>Not Answered</span>
                </div>
                <span>25%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-gray-600">Inbound Calls</CardTitle>
            <Select defaultValue="1week">
              <SelectTrigger className="w-20 h-6 text-xs border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="1month">1 Month</SelectItem>
                <SelectItem value="1week">1 Week</SelectItem>
                <SelectItem value="today">Today</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-20">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="2"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    strokeDasharray="60, 100"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2"
                    strokeDasharray="25, 100"
                    strokeDashoffset="-60"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeDasharray="15, 100"
                    strokeDashoffset="-85"
                  />
                </svg>
              </div>
            </div>
            <div className="text-xs space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Resolved</span>
                </div>
                <span>60%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span>Not Resolved</span>
                </div>
                <span>25%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <span>Forwarded</span>
                </div>
                <span>15%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-gray-600">Average Call Duration</CardTitle>
            <Select defaultValue="inbound">
              <SelectTrigger className="w-20 h-6 text-xs border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inbound">Inbound</SelectItem>
                <SelectItem value="outbound">Outbound</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <span className="text-3xl font-bold text-black">4.2</span>
              <p className="text-sm text-gray-500">minutes</p>
              <div className="mt-2 text-xs text-teal-600">+12% from last week</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-medium text-black">Number of Calls</CardTitle>
            <Select defaultValue="weekly">
              <SelectTrigger className="w-24 border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <AgentPerformanceChart />
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-medium text-black">Customer Talking Points</CardTitle>
            <Select defaultValue="inbound">
              <SelectTrigger className="w-24 border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inbound">Inbound</SelectItem>
                <SelectItem value="outbound">Outbound</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-64">
              <div className="relative w-48 h-48">
                <svg className="w-48 h-48 transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="2"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#14b8a6"
                    strokeWidth="2"
                    strokeDasharray="35, 100"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                    strokeDasharray="25, 100"
                    strokeDashoffset="-35"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeDasharray="20, 100"
                    strokeDashoffset="-60"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2"
                    strokeDasharray="20, 100"
                    strokeDashoffset="-80"
                  />
                </svg>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-teal-500 rounded-full"></div>
                <span>Refund Requests (35%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span>Location Inquiries (25%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <span>Product Support (20%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span>Billing Issues (20%)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Calls Table */}
      <Card className="bg-white border-gray-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-medium text-black">Recent Calls</CardTitle>
          <div className="flex items-center gap-4">
            <Tabs value={callType} onValueChange={setCallType} className="w-auto">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="inbound">Inbound</TabsTrigger>
                <TabsTrigger value="outbound">Outbound</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" className="border-gray-200 text-black hover:bg-gray-50 bg-transparent">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-black font-medium">Status</TableHead>
                <TableHead className="text-black font-medium">Contact</TableHead>
                <TableHead className="text-black font-medium">Date And Time</TableHead>
                <TableHead className="text-black font-medium">View Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentCalls[callType].map((call, index) => (
                <TableRow key={index} className="hover:bg-gray-50">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${call.statusColor}`} />
                      <Badge
                        variant="outline"
                        className={
                          call.status === "Resolved" || call.status === "Follow Up"
                            ? "bg-green-100 text-green-700 border-green-200"
                            : call.status === "Not Resolved" || call.status === "Not Interested"
                              ? "bg-red-100 text-red-700 border-red-200"
                              : call.status === "Forwarded"
                                ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                                : "bg-orange-100 text-orange-700 border-orange-200"
                        }
                      >
                        {call.status}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-black font-mono">{call.contact}</TableCell>
                  <TableCell className="text-black">{call.dateTime}</TableCell>
                  <TableCell>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-teal-600 hover:text-teal-700 hover:bg-teal-50"
                          onClick={() => setSelectedCall(call)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Call Summary</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-medium text-gray-600">Contact:</label>
                            <p className="font-mono">{call.contact}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-600">Status:</label>
                            <p>{call.status}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-600">Date & Time:</label>
                            <p>{call.dateTime}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-600">Summary:</label>
                            <p className="text-sm text-gray-700 leading-relaxed">{call.summary}</p>
                          </div>
                        </div>
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
