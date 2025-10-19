"use client"

import { useState, useEffect, useRef } from "react"
import { Calendar, Search, Phone, Clock, FileText } from "lucide-react"
import { DayPicker } from "react-day-picker"
import type { DateRange } from "react-day-picker"
import "react-day-picker/dist/style.css"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ChatDetailModal } from "@/components/chat-detail-modal"

interface VapiChat {
  id: string
  orgId: string
  previousChatId?: string
  input: Array<{ role: string; content: string }>
  output: Array<{ role: string; content: string }>
  assistantId: string
  messages: Array<{ role: string; content: string }>
  stream: boolean
  createdAt: string
  updatedAt: string
  cost: number
  costs: Array<any>
}

interface FormattedChat {
  id: string
  dateTime: string
  timestamp: number
  messageCount: number
  inputCount: number
  outputCount: number
  cost: number
  lastMessage: string
  stream: boolean
  isUnread: boolean
}

export default function ChatPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedFilter, setSelectedFilter] = useState("all")
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - 6)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return { from: start, to: end }
  })
  const [rangeLabel, setRangeLabel] = useState("Last 7 days")
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [chats, setChats] = useState<FormattedChat[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showConfigAlert, setShowConfigAlert] = useState(false)
  const [webAssistantId, setWebAssistantId] = useState<string | null>(null)
  const [selectedChat, setSelectedChat] = useState<VapiChat | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [allChats, setAllChats] = useState<VapiChat[]>([])
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x }
  function endOfDay(d: Date) { const x = new Date(d); x.setHours(23,59,59,999); return x }
  function formatDate(d: Date) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  
  async function applyPreset(preset: 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'all') {
    const now = new Date()
    if (preset === 'today') {
      const from = startOfDay(now)
      const to = endOfDay(now)
      setSelectedRange({ from, to })
      setRangeLabel('Today')
    } else if (preset === 'last7') {
      const to = endOfDay(now)
      const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6))
      setSelectedRange({ from, to })
      setRangeLabel('Last 7 days')
    } else if (preset === 'thisMonth') {
      const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1))
      const to = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0))
      setSelectedRange({ from, to })
      setRangeLabel('This month')
    } else if (preset === 'lastMonth') {
      const from = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1))
      const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0))
      setSelectedRange({ from, to })
      setRangeLabel('Last month')
    } else {
      setSelectedRange(undefined)
      setRangeLabel('All time')
    }
    setIsCalendarOpen(false)
    // trigger a server fetch so server-side filtering (if available) is used
    try {
      await fetchChats()
    } catch (e) {
      // ignore - fetchChats already sets error state
    }
  }

  async function applyRange() {
    if (selectedRange?.from && selectedRange?.to) {
      setRangeLabel(`${formatDate(selectedRange.from)} - ${formatDate(selectedRange.to)}`)
    } else {
      setRangeLabel('All time')
    }
    setIsCalendarOpen(false)
    // fetch chats with the newly applied range
    try {
      await fetchChats()
    } catch (e) {
      // fetchChats handles errors
    }
  }

  const setupAutoRefresh = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => {
      fetchChats()
    }, 300000) // 5 minutes
  }

  useEffect(() => {
    const init = async () => {
      await checkWebAssistantConfig()
    }

    init()
  }, [])

  useEffect(() => {
    if (webAssistantId !== null) {
      fetchChats()
      setupAutoRefresh()
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [webAssistantId])

  const checkWebAssistantConfig = async () => {
    try {
      const response = await fetch('/api/env/web-assistant')
      const result = await response.json()

      if (!result.configured) {
        setShowConfigAlert(true)
        setWebAssistantId(null)
      } else {
        setShowConfigAlert(false)
        setWebAssistantId(result.assistantId)
      }
    } catch (error) {
      console.error('Error checking web assistant config:', error)
      setShowConfigAlert(true)
    }
  }

  const mapStatus = (status: string): string => {
    switch (status?.toLowerCase()) {
      case 'ended':
      case 'completed':
        return 'Completed'
      case 'in-progress':
      case 'active':
        return 'Active'
      default:
        return status || 'Unknown'
    }
  }

  const fetchChats = async () => {
    try {
      setLoading(true)
      
      if (!webAssistantId) {
        setChats([])
        setLoading(false)
        return
      }

      // build query with optional date range parameters
      let url = `/api/vapi/chats?assistantId=${webAssistantId}`
      if (selectedRange?.from && selectedRange?.to) {
        try {
          const fromIso = selectedRange.from.toISOString()
          const toIso = selectedRange.to.toISOString()
          url += `&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`
        } catch (e) {
          // if dates aren't valid, ignore and fetch without range
        }
      }

      const response = await fetch(url)
      const result = await response.json()

      if (result.success && result.data) {
        const vapiChats: VapiChat[] = result.data

        console.log('Vapi chats received:', vapiChats.length)

        const formattedChats: FormattedChat[] = vapiChats.map((chat: VapiChat) => {
          const timestamp = new Date(chat.createdAt)
          const lastMessage = chat.output.length > 0 
            ? chat.output[chat.output.length - 1].content 
            : chat.input.length > 0 
              ? chat.input[chat.input.length - 1].content 
              : 'No messages'

          // Consider a chat unread if it was created/updated in the last 24 hours
          const isRecent = (Date.now() - timestamp.getTime()) < (24 * 60 * 60 * 1000)
          const isUnread = isRecent && chat.output.length > 0 // Has AI responses in last 24h

          return {
            id: chat.id,
            dateTime: timestamp.toLocaleString(),
            timestamp: timestamp.getTime(),
            messageCount: chat.messages.length,
            inputCount: chat.input.length,
            outputCount: chat.output.length,
            cost: chat.cost,
            lastMessage: lastMessage.substring(0, 100) + (lastMessage.length > 100 ? '...' : ''),
            stream: chat.stream,
            isUnread: isUnread
          }
        })

        setChats(formattedChats)
        setAllChats(vapiChats)
        setFetchError(null)
      } else {
        console.error('Vapi API error:', result.error)
        setFetchError('Failed to fetch chats from Vapi API')
      }
    } catch (error) {
      console.error('Error fetching chats:', error)
      setFetchError('Failed to fetch chats. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadgeColor = (status: string): string => {
    switch (status) {
      case 'Completed':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'Active':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const handleRefresh = async () => {
    await checkWebAssistantConfig()
    await fetchChats()
    setupAutoRefresh()
  }

  const filteredData = chats.filter((chat) => {
    const matchesSearch =
      chat.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      chat.lastMessage?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesFilter = selectedFilter === "all" || 
      (selectedFilter === "unread" && chat.isUnread) ||
      (selectedFilter === "read" && !chat.isUnread)

    const matchesDate = (() => {
      if (!selectedRange?.from || !selectedRange?.to) return true
      const start = startOfDay(selectedRange.from).getTime()
      const end = endOfDay(selectedRange.to).getTime()
      return chat.timestamp >= start && chat.timestamp <= end
    })()

    return matchesSearch && matchesFilter && matchesDate
  })

  const totalChats = filteredData.length

  const handleChatClick = (chatId: string) => {
    const chat = allChats.find(c => c.id === chatId)
    if (chat) {
      setSelectedChat(chat)
      setIsModalOpen(true)
    }
  }

  return (
    <div className="ml-20 p-6 pr-8 bg-white min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Chat</h1>
          <p className="text-gray-600 mt-1">View and manage chat conversations from Vapi</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="border-gray-200 text-gray-700 hover:bg-gray-50"
            disabled={loading}
          >
            <Clock className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Dialog open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 border-gray-200 text-gray-700 hover:bg-gray-50">
                <Calendar className="h-4 w-4" />
                {rangeLabel}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Select Date Range</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <div className="text-sm font-medium text-gray-700">Quick Presets</div>
                  <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
                    <Button variant="outline" className="justify-start bg-transparent hover:bg-teal-50 hover:text-teal-700" onClick={() => applyPreset('today')}>Today</Button>
                    <Button variant="outline" className="justify-start bg-transparent hover:bg-teal-50 hover:text-teal-700" onClick={() => applyPreset('last7')}>Last 7 days</Button>
                    <Button variant="outline" className="justify-start bg-transparent hover:bg-teal-50 hover:text-teal-700" onClick={() => applyPreset('thisMonth')}>This month</Button>
                    <Button variant="outline" className="justify-start bg-transparent hover:bg-teal-50 hover:text-teal-700" onClick={() => applyPreset('lastMonth')}>Last month</Button>
                    <Button variant="outline" className="justify-start bg-transparent hover:bg-teal-50 hover:text-teal-700" onClick={() => applyPreset('all')}>All time</Button>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <DayPicker
                    mode="range"
                    numberOfMonths={2}
                    showOutsideDays
                    selected={selectedRange}
                    onSelect={setSelectedRange}
                    weekStartsOn={1}
                    className="border rounded-lg p-3"
                  />
                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" className="bg-transparent" onClick={() => { setSelectedRange(undefined); setRangeLabel('All time'); setIsCalendarOpen(false); }}>Clear</Button>
                    <Button onClick={applyRange} className="bg-teal-500 hover:bg-teal-600 text-white">Apply Range</Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Configuration Alert */}
      {showConfigAlert && (
        <Alert className="mb-6 border-orange-200 bg-orange-50">
          <AlertDescription className="text-orange-800">
            No web assistant added. Please configure the VAPI_WEB_ASSISTANT_ID environment variable to enable chat tracking.
          </AlertDescription>
        </Alert>
      )}

      {/* Metrics Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Chats</CardTitle>
            <Phone className="h-4 w-4 text-teal-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-black">{totalChats}</div>
            <p className="text-xs text-gray-500">{rangeLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Unread Chats</CardTitle>
            <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-black">
              {filteredData.filter(c => c.isUnread).length}
            </div>
            <p className="text-xs text-gray-500">Need attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Messages</CardTitle>
            <Clock className="h-4 w-4 text-teal-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-black">
              {filteredData.reduce((sum, c) => sum + c.messageCount, 0)}
            </div>
            <p className="text-xs text-gray-500">Messages exchanged</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search chat ID or last message..."
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
            className="pl-10 border-gray-200 focus:border-teal-500 focus:ring-teal-500"
          />
        </div>

        <Select value={selectedFilter} onValueChange={setSelectedFilter}>
          <SelectTrigger className="w-48 border-gray-200">
            <SelectValue placeholder="Filter by Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Chats</SelectItem>
            <SelectItem value="unread">Unread Only</SelectItem>
            <SelectItem value="read">Read Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Chats Table */}
      <Card className="shadow-sm border-gray-200">
        <CardContent className="p-0">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Clock className="h-6 w-6 animate-spin text-teal-500 mr-3" />
              <span className="text-gray-600">Loading chats...</span>
            </div>
          )}
          
          {fetchError && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-red-600 mb-2">{fetchError}</p>
                <Button onClick={handleRefresh} variant="outline" size="sm">
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {!loading && !fetchError && (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead className="font-semibold text-gray-700">Chat ID</TableHead>
                  <TableHead className="font-semibold text-gray-700">Messages</TableHead>
                  <TableHead className="font-semibold text-gray-700">Type</TableHead>
                  <TableHead className="font-semibold text-gray-700">Date & Time</TableHead>
                  <TableHead className="font-semibold text-gray-700">Last Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((chat) => (
                  <TableRow 
                    key={chat.id} 
                    className={`hover:bg-gray-50/50 transition-colors cursor-pointer ${
                      chat.isUnread ? 'bg-orange-50/30 border-l-4 border-orange-500' : ''
                    }`}
                    onClick={() => handleChatClick(chat.id)}
                  >
                    <TableCell className="py-4">
                      <div className="flex items-center gap-2">
                        <div className="text-sm text-gray-600 font-mono">
                          {chat.id.substring(0, 12)}...
                        </div>
                        {chat.isUnread && (
                          <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <Phone className="h-3 w-3 mr-1" />
                        {chat.messageCount} ({chat.inputCount}↑ {chat.outputCount}↓)
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <Badge variant="outline" className={chat.stream ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-700 border-gray-200"}>
                        {chat.stream ? "Stream" : "Static"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="text-sm text-gray-900">
                        {chat.dateTime}
                      </div>
                    </TableCell>
                    <TableCell className="py-4 max-w-xs">
                      <div className="truncate text-sm text-gray-700">
                        {chat.lastMessage}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {!loading && !fetchError && filteredData.length === 0 && (
            <div className="text-center py-12">
              <Phone className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No chats found</h3>
              <p className="text-gray-500 mb-4">
                {showConfigAlert 
                  ? 'Configure VAPI_WEB_ASSISTANT_ID to start tracking chats.'
                  : searchTerm || selectedFilter !== 'all' 
                    ? 'Try adjusting your search or filters to find what you\'re looking for.'
                    : 'Your chat history will appear here once conversations are initiated.'}
              </p>
              {(searchTerm || selectedFilter !== 'all') && !showConfigAlert && (
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setSearchTerm('')
                    setSelectedFilter('all')
                  }}
                  className="border-gray-200"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ChatDetailModal 
        chat={selectedChat}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  )
}
