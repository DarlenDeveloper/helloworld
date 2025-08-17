"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Download, FileText, Clock, Shield, Users } from "lucide-react"

export default function ReportsPage() {
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([])
  const [dateRange, setDateRange] = useState({ start: "", end: "" })
  const [reportFormat, setReportFormat] = useState("")
  const [scheduledReports, setScheduledReports] = useState([
    {
      id: 1,
      name: "Daily Call Summary",
      frequency: "Daily",
      format: "PDF",
      nextRun: "2025-01-17 09:00",
      status: "Active",
    },
    {
      id: 2,
      name: "Weekly Analytics",
      frequency: "Weekly",
      format: "Excel",
      nextRun: "2025-01-20 08:00",
      status: "Active",
    },
    {
      id: 3,
      name: "Monthly Compliance Report",
      frequency: "Monthly",
      format: "PDF",
      nextRun: "2025-02-01 10:00",
      status: "Paused",
    },
  ])
  const [auditLogs] = useState([
    {
      id: 1,
      user: "john.doe@company.com",
      action: "Generated Call Report",
      timestamp: "2025-01-16 14:30",
      role: "Manager",
    },
    { id: 2, user: "admin@company.com", action: "Exported Audit Logs", timestamp: "2025-01-16 13:15", role: "Admin" },
    {
      id: 3,
      user: "agent.smith@company.com",
      action: "Accessed Analytics Dashboard",
      timestamp: "2025-01-16 12:45",
      role: "Agent",
    },
  ])

  const availableMetrics = [
    "Total Calls",
    "Call Duration",
    "Success Rate",
    "Follow-up Rate",
    "Customer Satisfaction",
    "Agent Performance",
    "Campaign Results",
    "Revenue Generated",
  ]

  const handleMetricToggle = (metric: string) => {
    setSelectedMetrics((prev) => (prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]))
  }

  const generateReport = () => {
    if (selectedMetrics.length === 0) {
      alert("Please select at least one metric")
      return
    }
    if (!dateRange.start || !dateRange.end) {
      alert("Please select a date range")
      return
    }
    if (!reportFormat) {
      alert("Please select a report format")
      return
    }

    // Simulate report generation
    const reportData = {
      metrics: selectedMetrics,
      dateRange,
      format: reportFormat,
      watermark: true,
      timestamp: new Date().toISOString(),
    }

    console.log("Generating report:", reportData)
    alert(`Report generated successfully! Format: ${reportFormat}, Metrics: ${selectedMetrics.join(", ")}`)
  }

  const scheduleReport = () => {
    const newReport = {
      id: scheduledReports.length + 1,
      name: `Custom Report ${scheduledReports.length + 1}`,
      frequency: "Weekly",
      format: reportFormat || "PDF",
      nextRun: "2025-01-24 09:00",
      status: "Active",
    }
    setScheduledReports([...scheduledReports, newReport])
    alert("Scheduled report created successfully!")
  }

  const exportAuditLogs = (format: string) => {
    const exportData = {
      logs: auditLogs,
      format,
      exportedBy: "current.user@company.com",
      timestamp: new Date().toISOString(),
      watermark: true,
    }
    console.log("Exporting audit logs:", exportData)
    alert(`Audit logs exported as ${format} with security watermark`)
  }

  return (
    <div className="ml-20 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-black">Reports & Export</h1>
        <Badge variant="outline" className="text-teal-600 border-teal-600">
          <Shield className="h-4 w-4 mr-1" />
          Enterprise Ready
        </Badge>
      </div>

      {/* Report Builder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-teal-600" />
            Report Builder
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Metrics Selection */}
          <div>
            <Label className="text-base font-medium mb-3 block">Select Metrics</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {availableMetrics.map((metric) => (
                <div key={metric} className="flex items-center space-x-2">
                  <Checkbox
                    id={metric}
                    checked={selectedMetrics.includes(metric)}
                    onCheckedChange={() => handleMetricToggle(metric)}
                  />
                  <Label htmlFor={metric} className="text-sm">
                    {metric}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
              />
            </div>
          </div>

          {/* Format Selection */}
          <div>
            <Label>Report Format</Label>
            <Select value={reportFormat} onValueChange={setReportFormat}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PDF">PDF Report</SelectItem>
                <SelectItem value="Excel">Excel Spreadsheet</SelectItem>
                <SelectItem value="CSV">CSV Data</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3">
            <Button onClick={generateReport} className="bg-teal-600 hover:bg-teal-700">
              <Download className="h-4 w-4 mr-2" />
              Generate Report
            </Button>
            <Button variant="outline" onClick={scheduleReport}>
              <Clock className="h-4 w-4 mr-2" />
              Schedule Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Scheduled Reports */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-teal-600" />
            Scheduled Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {scheduledReports.map((report) => (
              <div key={report.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <h4 className="font-medium">{report.name}</h4>
                  <p className="text-sm text-gray-600">
                    {report.frequency} • {report.format} • Next: {report.nextRun}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={report.status === "Active" ? "default" : "secondary"}>{report.status}</Badge>
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 bg-transparent">
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-teal-600" />
            Audit Logs & Compliance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-600">Export interaction histories for regulatory compliance</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportAuditLogs("PDF")}>
                Export PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportAuditLogs("Excel")}>
                Export Excel
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {auditLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between p-3 border rounded">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">{log.user}</span>
                    <Badge variant="outline" className="text-xs">
                      {log.role}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{log.action}</p>
                </div>
                <span className="text-sm text-gray-500">{log.timestamp}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* User Activity Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-teal-600" />
            User Activity & Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-teal-600">24</div>
              <div className="text-sm text-gray-600">Admin Actions</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-blue-600">156</div>
              <div className="text-sm text-gray-600">Manager Activities</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-green-600">892</div>
              <div className="text-sm text-gray-600">Agent Interactions</div>
            </div>
          </div>

          <Button className="w-full bg-teal-600 hover:bg-teal-700">
            <Download className="h-4 w-4 mr-2" />
            Export Complete Activity Report (Watermarked)
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
