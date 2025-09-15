"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Clock, Users } from "lucide-react"

interface LoginLog {
  id: string
  user_id: string
  email: string
  status: "success" | "failed" | "blocked"
  ip_address: string | null
  user_agent: string | null
  location: string | null
  device: string | null
  created_at: string
}

export default function ReportsPage() {
  const supabase = createClient()

  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - 7)
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
  })
  const [reportFormat, setReportFormat] = useState("CSV")

  const [auditLogs, setAuditLogs] = useState<LoginLog[]>([])
  const [loading, setLoading] = useState(true)

  const availableMetrics = [
    "Total Calls",
    "Call Duration",
    "Success Rate",
    "Follow-up Rate",
    "Agent Performance",
    "Campaign Results",
    "Sentiment Breakdown",
  ]

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        await fetchAuditLogs(user.id)
        // realtime for audit logs
        const channel = supabase
          .channel("user_login_logs_changes")
          .on("postgres_changes", { event: "*", schema: "public", table: "user_login_logs", filter: `user_id=eq.${user.id}` }, () => fetchAuditLogs(user.id))
          .subscribe()
        return () => { supabase.removeChannel(channel) }
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [supabase])

  const fetchAuditLogs = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_login_logs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50)
    if (!error) setAuditLogs((data || []) as LoginLog[])
  }

  const handleMetricToggle = (metric: string) => {
    setSelectedMetrics((prev) => (prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]))
  }

  const getDateBounds = () => {
    const start = new Date(dateRange.start)
    start.setHours(0, 0, 0, 0)
    const end = new Date(dateRange.end)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }

  const generateReport = async () => {
    if (selectedMetrics.length === 0) {
      alert("Select at least one metric")
      return
    }
    const { start, end } = getDateBounds()

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        alert("Please login to generate a report")
        return
      }

      // Fetch call_history within range for current user
      const { data: historyRows, error: histErr } = await supabase
        .from("call_history")
        .select("id,user_id,campaign_id,contact_id,status,duration,call_date,sentiment")
        .eq("user_id", user.id)
        .gte("call_date", start.toISOString())
        .lte("call_date", end.toISOString())

      // Fetch calls within range (for outbound follow-up rate) for current user
      const { data: callsRows, error: callsErr } = await supabase
        .from("calls")
        .select("id,call_type,status,created_at")
        .eq("user_id", user.id)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())

      if (histErr || callsErr) throw new Error("Failed to fetch data for report")

      const history = (historyRows || []) as any[]
      const calls = (callsRows || []) as any[]

      const metrics: Record<string, any> = {}

      if (selectedMetrics.includes("Total Calls")) {
        metrics.total_calls = history.length
      }

      if (selectedMetrics.includes("Call Duration")) {
        const totalSec = history.reduce((s, r) => s + (r.duration || 0), 0)
        const avgMin = history.length ? (totalSec / 60 / history.length) : 0
        metrics.total_duration_minutes = Math.round(totalSec / 60)
        metrics.avg_duration_minutes = Math.round(avgMin * 10) / 10
      }

      if (selectedMetrics.includes("Success Rate")) {
        const completed = history.filter((r) => r.status === "completed").length
        const rate = history.length ? Math.round((completed / history.length) * 1000) / 10 : 0
        metrics.success_rate_percent = rate
      }

      if (selectedMetrics.includes("Follow-up Rate")) {
        const outbound = calls.filter((c) => c.call_type === "outbound")
        const completed = outbound.filter((c) => c.status === "completed").length
        const rate = outbound.length ? Math.round((completed / outbound.length) * 1000) / 10 : 0
        metrics.follow_up_rate_percent = rate
      }

      if (selectedMetrics.includes("Agent Performance")) {
        const byAgent = new Map<string, { count: number; totalSec: number }>()
        for (const r of history) {
          const k = r.user_id || "unknown"
          const v = byAgent.get(k) || { count: 0, totalSec: 0 }
          v.count += 1
          v.totalSec += r.duration || 0
          byAgent.set(k, v)
        }
        const rows = Array.from(byAgent.entries()).map(([user_id, v]) => ({
          user_id,
          calls: v.count,
          avg_min: v.count ? Math.round((v.totalSec / 60 / v.count) * 10) / 10 : 0,
        }))
        metrics.agent_performance = rows.sort((a, b) => b.calls - a.calls).slice(0, 10)
      }

      if (selectedMetrics.includes("Campaign Results")) {
        const byCamp = new Map<string, { calls: number; completed: number }>()
        for (const r of history) {
          const k = r.campaign_id || "unknown"
          const v = byCamp.get(k) || { calls: 0, completed: 0 }
          v.calls += 1
          if (r.status === "completed") v.completed += 1
          byCamp.set(k, v)
        }
        metrics.campaign_results = Array.from(byCamp.entries()).map(([campaign_id, v]) => ({ campaign_id, calls: v.calls, completed: v.completed }))
      }

      if (selectedMetrics.includes("Sentiment Breakdown")) {
        const bySent = new Map<string, number>()
        for (const r of history) {
          const k = (r.sentiment || "unknown").toString()
          bySent.set(k, (bySent.get(k) || 0) + 1)
        }
        metrics.sentiment_breakdown = Array.from(bySent.entries()).map(([sentiment, count]) => ({ sentiment, count }))
      }

      // Build CSV from metrics
      const lines: string[] = []
      lines.push(`Report Period,${start.toISOString()},${end.toISOString()}`)
      if (metrics.total_calls !== undefined) lines.push(`Total Calls,${metrics.total_calls}`)
      if (metrics.total_duration_minutes !== undefined || metrics.avg_duration_minutes !== undefined) {
        lines.push(`Total Duration (min),${metrics.total_duration_minutes || 0}`)
        lines.push(`Average Duration (min),${metrics.avg_duration_minutes || 0}`)
      }
      if (metrics.success_rate_percent !== undefined) lines.push(`Success Rate (%),${metrics.success_rate_percent}`)
      if (metrics.follow_up_rate_percent !== undefined) lines.push(`Follow-up Rate (%),${metrics.follow_up_rate_percent}`)
      if (metrics.agent_performance) {
        lines.push("Agent Performance (Top 10)")
        lines.push("user_id,calls,avg_min")
        for (const r of metrics.agent_performance) lines.push(`${r.user_id},${r.calls},${r.avg_min}`)
      }
      if (metrics.campaign_results) {
        lines.push("Campaign Results")
        lines.push("campaign_id,calls,completed")
        for (const r of metrics.campaign_results) lines.push(`${r.campaign_id},${r.calls},${r.completed}`)
      }
      if (metrics.sentiment_breakdown) {
        lines.push("Sentiment Breakdown")
        lines.push("sentiment,count")
        for (const r of metrics.sentiment_breakdown) lines.push(`${r.sentiment},${r.count}`)
      }

      const csv = lines.join("\n")
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `report_${dateRange.start}_${dateRange.end}.${reportFormat.toLowerCase() === "excel" ? "csv" : "csv"}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      console.error("Failed to generate report:", e)
      alert("Failed to generate report")
    }
  }

  const exportAudit = (format: string) => {
    const rows = [
      ["email", "status", "created_at", "ip_address", "location", "device"],
      ...auditLogs.map((l) => [
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
    a.download = `audit_logs_${dateRange.start}_${dateRange.end}.${format.toLowerCase() === "excel" ? "csv" : "csv"}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const metricsSummary = useMemo(() => {
    return `${selectedMetrics.length} metric(s) • ${dateRange.start} → ${dateRange.end}`
  }, [selectedMetrics, dateRange])

  if (loading) {
    return (
      <div className="ml-20 p-6 text-gray-600">Loading Reports...</div>
    )
  }

  return (
    <div className="ml-20 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-black">Reports & Export</h1>
        <Badge variant="outline" className="text-teal-600 border-teal-600">
          Live Data
        </Badge>
      </div>

      {/* Report Builder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
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
                  <Checkbox id={metric} checked={selectedMetrics.includes(metric)} onCheckedChange={() => handleMetricToggle(metric)} />
                  <Label htmlFor={metric} className="text-sm">{metric}</Label>
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateRange((p) => ({ ...p, start: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={dateRange.end}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateRange((p) => ({ ...p, end: e.target.value }))}
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
                <SelectItem value="CSV">CSV Data</SelectItem>
                <SelectItem value="Excel">Excel (CSV)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">Exports are generated from live data.</p>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={generateReport} className="bg-teal-600 hover:bg-teal-700">
              Generate Report
            </Button>
            <span className="text-xs text-gray-600">{metricsSummary}</span>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Logs & Compliance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-600">Export authentication events for compliance</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportAudit("PDF")}>Export PDF</Button>
              <Button variant="outline" size="sm" onClick={() => exportAudit("Excel")}>Export Excel</Button>
            </div>
          </div>

          <div className="space-y-2">
            {auditLogs.length === 0 ? (
              <div className="text-sm text-gray-500">No login events</div>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <Users className="h-4 w-4 text-gray-500" />
                      <span className="font-medium">{log.email}</span>
                      <Badge variant="outline" className="text-xs">{log.status}</Badge>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">IP: {log.ip_address || "-"} • Device: {log.device || "-"}</p>
                  </div>
                  <span className="text-sm text-gray-500">{new Date(log.created_at).toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
