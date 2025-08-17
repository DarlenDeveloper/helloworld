"use client"

import { useState } from "react"
import { Calendar, Download, FileText, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"

const generateCallsData = (startDate: Date, endDate: Date) => {
  const data = []
  const current = new Date(startDate)

  while (current <= endDate) {
    const dayName = current.toLocaleDateString("en-US", { weekday: "short" })
    const dateStr = `${current.getMonth() + 1}/${current.getDate()}/${current.getFullYear().toString().slice(-2)}`

    data.push({
      date: dayName,
      fullDate: new Date(current),
      dateLabel: `${dayName} ${dateStr}`,
      calls: Math.floor(Math.random() * 200) + 50,
    })
    current.setDate(current.getDate() + 1)
  }
  return data
}

const generateFollowUpData = (dateRange: { start: Date; end: Date }) => {
  const baseData = [
    { name: "Follow Up", baseValue: 45, color: "#14b8a6" },
    { name: "Not Interested", baseValue: 30, color: "#ef4444" },
    { name: "Not Answered", baseValue: 25, color: "#6b7280" },
  ]

  return baseData.map((item) => ({
    ...item,
    value: item.baseValue + Math.floor(Math.random() * 10) - 5, // Slight variation based on date
  }))
}

const generateTalkingPointsData = (dateRange: { start: Date; end: Date }) => {
  const baseData = [
    { name: "Health Insurance", baseValue: 35, color: "#14b8a6", baseCalls: 245 },
    { name: "Life Insurance", baseValue: 28, color: "#3b82f6", baseCalls: 196 },
    { name: "Auto Insurance", baseValue: 20, color: "#f59e0b", baseCalls: 140 },
    { name: "Home Insurance", baseValue: 17, color: "#8b5cf6", baseCalls: 119 },
  ]

  return baseData.map((item) => ({
    ...item,
    value: item.baseValue + Math.floor(Math.random() * 8) - 4,
    calls: item.baseCalls + Math.floor(Math.random() * 50) - 25,
  }))
}

export default function AnalyticsPage() {
  const [selectedDateRange, setSelectedDateRange] = useState<Date[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [showModal, setShowModal] = useState(false)
  const [modalData, setModalData] = useState<any>(null)
  const [modalType, setModalType] = useState<"calls" | "followup" | "talking">("calls")

  const callsData =
    selectedDateRange.length >= 2
      ? generateCallsData(selectedDateRange[0], selectedDateRange[selectedDateRange.length - 1])
      : []

  const followUpData =
    selectedDateRange.length >= 2
      ? generateFollowUpData({ start: selectedDateRange[0], end: selectedDateRange[selectedDateRange.length - 1] })
      : []

  const talkingPointsData =
    selectedDateRange.length >= 2
      ? generateTalkingPointsData({ start: selectedDateRange[0], end: selectedDateRange[selectedDateRange.length - 1] })
      : []

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days = []

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day))
    }

    return days
  }

  const handleDateClick = (date: Date) => {
    if (!date) return

    const dateStr = date.toDateString()
    const existingIndex = selectedDateRange.findIndex((d) => d.toDateString() === dateStr)

    if (existingIndex >= 0) {
      // Remove date if already selected
      setSelectedDateRange(selectedDateRange.filter((_, i) => i !== existingIndex))
    } else if (selectedDateRange.length < 7) {
      // Add date if under 7 days limit
      const newRange = [...selectedDateRange, date].sort((a, b) => a.getTime() - b.getTime())
      setSelectedDateRange(newRange)
    }
  }

  const isDateSelected = (date: Date) => {
    if (!date) return false
    return selectedDateRange.some((d) => d.toDateString() === date.toDateString())
  }

  const isDateInRange = (date: Date) => {
    if (!date || selectedDateRange.length < 2) return false
    const sortedRange = [...selectedDateRange].sort((a, b) => a.getTime() - b.getTime())
    return date >= sortedRange[0] && date <= sortedRange[sortedRange.length - 1]
  }

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentMonth((prev) => {
      const newMonth = new Date(prev)
      if (direction === "prev") {
        newMonth.setMonth(prev.getMonth() - 1)
      } else {
        newMonth.setMonth(prev.getMonth() + 1)
      }
      return newMonth
    })
  }

  const clearSelection = () => {
    setSelectedDateRange([])
  }

  const handleBarClick = (data: any) => {
    setModalData(data)
    setModalType("calls")
    setShowModal(true)
  }

  const handlePieClick = (data: any, type: "followup" | "talking") => {
    setModalData(data)
    setModalType(type)
    setShowModal(true)
  }

  const downloadAllCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,"

    // Calls data
    csvContent += "CALLS DATA\n"
    csvContent += "Date,Day,Number of Calls\n"
    callsData.forEach((item) => {
      csvContent += `${item.fullDate.toLocaleDateString()},${item.date},${item.calls}\n`
    })

    csvContent += "\nFOLLOW UP STATUS\n"
    csvContent += "Status,Percentage\n"
    followUpData.forEach((item) => {
      csvContent += `${item.name},${item.value}%\n`
    })

    csvContent += "\nCUSTOMER TALKING POINTS\n"
    csvContent += "Topic,Percentage,Number of Calls\n"
    talkingPointsData.forEach((item) => {
      csvContent += `${item.name},${item.value}%,${item.calls}\n`
    })

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", "analytics_report.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const downloadAllPDF = () => {
    console.log("[v0] PDF download initiated for all analytics data")
    alert("Combined PDF report download would start here")
  }

  const downloadCSV = () => {
    const csvContent =
      "data:text/csv;charset=utf-8,Name,Phone,Status,Campaign\nJohn Doe,+256701234567,Follow Up,Health Campaign\nJane Smith,+256709876543,Interested,Life Campaign"
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `${modalType}_data.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const downloadPDF = () => {
    console.log("[v0] PDF download initiated for", modalType, modalData)
    alert("PDF download would start here")
  }

  const days = getDaysInMonth(currentMonth)
  const monthYear = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })

  return (
    <div className="ml-20 p-6 bg-white min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-black mb-2">Analytics Dashboard</h1>
        <p className="text-gray-600">Analyze your AI agent performance and customer interactions</p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-teal-500" />
            Date Range Selection (Max 7 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-4">
              <Button variant="outline" onClick={() => navigateMonth("prev")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="text-lg font-semibold">{monthYear}</h3>
              <Button variant="outline" onClick={() => navigateMonth("next")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((date, index) => (
                <button
                  key={index}
                  onClick={() => handleDateClick(date)}
                  disabled={!date}
                  className={`
                    p-2 text-sm rounded-md transition-colors
                    ${!date ? "invisible" : ""}
                    ${isDateSelected(date) ? "bg-teal-500 text-white" : ""}
                    ${isDateInRange(date) && !isDateSelected(date) ? "bg-teal-100 text-teal-700" : ""}
                    ${date && !isDateSelected(date) && !isDateInRange(date) ? "hover:bg-gray-100" : ""}
                    ${date && selectedDateRange.length >= 7 && !isDateSelected(date) ? "opacity-50 cursor-not-allowed" : ""}
                  `}
                >
                  {date?.getDate()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">
                Selected: {selectedDateRange.length} day{selectedDateRange.length !== 1 ? "s" : ""}
                {selectedDateRange.length > 0 && (
                  <span className="ml-2">
                    ({selectedDateRange[0]?.toLocaleDateString()} -{" "}
                    {selectedDateRange[selectedDateRange.length - 1]?.toLocaleDateString()})
                  </span>
                )}
              </p>
            </div>
            {selectedDateRange.length > 0 && (
              <Button variant="outline" onClick={clearSelection} className="text-sm bg-transparent">
                Clear Selection
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Analytics Widgets */}
      {selectedDateRange.length >= 2 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8 mb-8">
          <Card className="col-span-1 lg:col-span-2 xl:col-span-1">
            <CardHeader>
              <CardTitle>Number of Calls</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={callsData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dateLabel" angle={-45} textAnchor="end" height={80} fontSize={12} />
                  <YAxis />
                  <Tooltip />
                  <Bar
                    dataKey="calls"
                    fill="#14b8a6"
                    onClick={handleBarClick}
                    style={{ cursor: "pointer" }}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Follow Ups */}
          <Card>
            <CardHeader>
              <CardTitle>Follow Up Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={followUpData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    onClick={(data) => handlePieClick(data, "followup")}
                    style={{ cursor: "pointer" }}
                  >
                    {followUpData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value}%`, "Percentage"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {followUpData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: item.color }}></div>
                      <span className="text-sm">{item.name}</span>
                    </div>
                    <span className="text-sm font-medium">{item.value}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Customer Talking Points */}
          <Card>
            <CardHeader>
              <CardTitle>Customer Talking Points</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={talkingPointsData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    onClick={(data) => handlePieClick(data, "talking")}
                    style={{ cursor: "pointer" }}
                  >
                    {talkingPointsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name, props) => [`${value}% (${props.payload.calls} calls)`, "Interest"]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {talkingPointsData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: item.color }}></div>
                      <span className="text-sm">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{item.value}%</div>
                      <div className="text-xs text-gray-500">{item.calls} calls</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="mb-8">
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Please select at least 2 dates to view analytics</p>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedDateRange.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Export Analytics Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button onClick={downloadAllCSV} className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600">
                <Download className="h-4 w-4" />
                Download CSV Report
              </Button>
              <Button onClick={downloadAllPDF} variant="outline" className="flex items-center gap-2 bg-transparent">
                <FileText className="h-4 w-4" />
                Download PDF Report
              </Button>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              Export includes call data, follow-up status, and customer talking points for selected date range
            </p>
          </CardContent>
        </Card>
      )}

      {/* Download Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Download Data</DialogTitle>
            <DialogDescription>
              {modalType === "calls" && `Download call data for ${modalData?.dateLabel || "selected date"}`}
              {modalType === "followup" && `Download ${modalData?.name || "follow up"} contacts`}
              {modalType === "talking" && `Download contacts interested in ${modalData?.name || "selected topic"}`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-4 mt-4">
            <Button onClick={downloadCSV} className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600">
              <Download className="h-4 w-4" />
              Download CSV
            </Button>
            <Button onClick={downloadPDF} variant="outline" className="flex items-center gap-2 bg-transparent">
              <FileText className="h-4 w-4" />
              Download PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
