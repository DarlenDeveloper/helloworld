"use client"

import { useEffect, useState } from "react"
import { Calendar, TrendingUp, Users, Phone, BarChart3, PieChart, Brain } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CallVolumeChart } from "@/components/deep-insights/call-volume-chart"
import { SuccessRateChart } from "@/components/deep-insights/success-rate-chart"
import { PerformanceBenchmarkChart } from "@/components/deep-insights/performance-benchmark-chart"
import { CallOutcomeBreakdown } from "@/components/deep-insights/call-outcome-breakdown"
import { CampaignAnalytics } from "@/components/deep-insights/campaign-analytics"
import { AIInsights } from "@/components/deep-insights/ai-insights"

export default function DeepInsightsPage() {
  const [selectedDateRange, setSelectedDateRange] = useState<Date[]>(() => {
    // Default to last 7 days
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - 6)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    const arr: Date[] = []
    const d = new Date(start)
    while (d <= end) {
      arr.push(new Date(d))
      d.setDate(d.getDate() + 1)
    }
    return arr
  })
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days: (Date | null)[] = []

    for (let i = 0; i < startingDayOfWeek; i++) days.push(null)
    for (let day = 1; day <= daysInMonth; day++) days.push(new Date(year, month, day))

    return days
  }

  const handleDateClick = (date: Date | null) => {
    if (!date) return
    const clicked = new Date(date.getFullYear(), date.getMonth(), date.getDate())

    if (selectedDateRange.length === 0) {
      setSelectedDateRange([clicked])
      return
    }

    if (selectedDateRange.length === 1) {
      const a = new Date(selectedDateRange[0].getFullYear(), selectedDateRange[0].getMonth(), selectedDateRange[0].getDate())
      const start = new Date(Math.min(a.getTime(), clicked.getTime()))
      const end = new Date(Math.max(a.getTime(), clicked.getTime()))
      const msPerDay = 24 * 3600 * 1000
      const span = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1
      const capped = Math.min(span, 30) // Max 30 days as requested

      const cappedEnd = new Date(start)
      cappedEnd.setDate(start.getDate() + capped - 1)

      const arr: Date[] = []
      const d = new Date(start)
      while (d <= cappedEnd) {
        arr.push(new Date(d))
        d.setDate(d.getDate() + 1)
      }
      setSelectedDateRange(arr)
      return
    }

    // If a range already exists, start a new range from the clicked day
    setSelectedDateRange([clicked])
  }

  const isDateSelected = (date: Date | null) => {
    if (!date) return false
    return selectedDateRange.some((d) => d.toDateString() === date.toDateString())
  }

  const isDateInRange = (date: Date | null) => {
    if (!date || selectedDateRange.length < 2) return false
    const sortedRange = [...selectedDateRange].sort((a, b) => a.getTime() - b.getTime())
    return date >= sortedRange[0] && date <= sortedRange[sortedRange.length - 1]
  }

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentMonth((prev) => {
      const newMonth = new Date(prev)
      if (direction === "prev") newMonth.setMonth(prev.getMonth() - 1)
      else newMonth.setMonth(prev.getMonth() + 1)
      return newMonth
    })
  }

  const clearSelection = () => setSelectedDateRange([])

  const days = getDaysInMonth(currentMonth)
  const monthYear = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })

  // Calculate date range for API calls
  const dateRange = selectedDateRange.length >= 2 ? {
    start: selectedDateRange[0].toISOString(),
    end: selectedDateRange[selectedDateRange.length - 1].toISOString()
  } : null

  return (
    <div className="ml-20 p-6 bg-white min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-black mb-2">Deep Insights</h1>
        <p className="text-gray-600">Advanced AI call analytics powered by Vapi</p>
      </div>

      {/* Date Range Picker */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-500" />
            Date Range Selection (Max 30 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-4">
              <Button variant="outline" onClick={() => navigateMonth("prev")}>
                ‹
              </Button>
              <h3 className="text-lg font-semibold">{monthYear}</h3>
              <Button variant="outline" onClick={() => navigateMonth("next")}>
                ›
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
                    ${isDateSelected(date) ? "bg-blue-500 text-white" : ""}
                    ${isDateInRange(date) && !isDateSelected(date) ? "bg-blue-100 text-blue-700" : ""}
                    ${date && !isDateSelected(date) && !isDateInRange(date) ? "hover:bg-gray-100" : ""}
                    ${date && selectedDateRange.length >= 30 && !isDateSelected(date) ? "opacity-50 cursor-not-allowed" : ""}
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
                    ({selectedDateRange[0]?.toLocaleDateString()} - {selectedDateRange[selectedDateRange.length - 1]?.toLocaleDateString()})
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

      {/* Analytics Dashboard */}
      {selectedDateRange.length >= 2 && dateRange ? (
        <div className="space-y-8">
          {/* Call Volume Trends */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                Call Volume Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CallVolumeChart dateRange={dateRange} />
            </CardContent>
          </Card>

          {/* Success Rate Analytics & Performance Benchmarking */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                  Success Rate Analytics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SuccessRateChart dateRange={dateRange} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-500" />
                  Performance Benchmarking
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PerformanceBenchmarkChart dateRange={dateRange} />
              </CardContent>
            </Card>
          </div>

          {/* Call Outcome Breakdown & Campaign Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5 text-orange-500" />
                  Call Outcome Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CallOutcomeBreakdown dateRange={dateRange} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-teal-500" />
                  Campaign Analytics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CampaignAnalytics dateRange={dateRange} />
              </CardContent>
            </Card>
          </div>

          {/* AI Insights */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-indigo-500" />
                AI Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AIInsights dateRange={dateRange} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="mb-8">
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Please select at least 2 dates to view deep insights</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
