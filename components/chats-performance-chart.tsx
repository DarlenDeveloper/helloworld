"use client"

import { useMemo } from "react"
import { Bar, XAxis, YAxis, ResponsiveContainer, Line, ComposedChart, Tooltip } from "recharts"

const XAxisAny: any = XAxis
const YAxisAny: any = YAxis

interface Point {
  label: string
  count: number
  line: number
}

interface Chat {
  id: string
  createdAt?: string
  created_at?: string
}

export function ChatsPerformanceChart({
  period = "weekly",
  chats = []
}: {
  period?: "weekly" | "monthly"
  chats?: Chat[]
}) {
  const labels = useMemo(() => {
    const now = new Date()
    if (period === "weekly") {
      const arr: string[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(now.getDate() - i)
        arr.push(d.toLocaleDateString(undefined, { weekday: "short" }))
      }
      return arr
    } else {
      const arr: string[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now)
        d.setMonth(now.getMonth() - i)
        arr.push(d.toLocaleDateString(undefined, { month: "short" }))
      }
      return arr
    }
  }, [period])

  const data = useMemo(() => {
    const now = new Date()
    let start: Date
    if (period === "weekly") {
      start = new Date(now)
      start.setDate(now.getDate() - 6)
      start.setHours(0, 0, 0, 0)
    } else {
      start = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0)
    }

    const getCreated = (c: Chat) => c.createdAt || c.created_at || ''

    const filtered = chats.filter((c) => {
      const d = new Date(getCreated(c))
      return !isNaN(d.getTime()) && d >= start
    })

    if (period === "weekly") {
      const buckets = new Array(7).fill(0)
      filtered.forEach((c) => {
        const d = new Date(getCreated(c))
        const startDay = new Date(start)
        const msPerDay = 24 * 3600 * 1000
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
        const offset = Math.floor((dayStart.getTime() - startDay.getTime()) / msPerDay)
        if (offset >= 0 && offset < 7) buckets[offset] += 1
      })
      return buckets.map((n, idx) => ({ label: labels[idx], count: n, line: n }))
    } else {
      const buckets = new Array(12).fill(0)
      filtered.forEach((c) => {
        const d = new Date(getCreated(c))
        const monthsDiff = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth())
        if (monthsDiff >= 0 && monthsDiff < 12) buckets[monthsDiff] += 1
      })
      return buckets.map((n, idx) => ({ label: labels[idx], count: n, line: n }))
    }
  }, [chats, period, labels])

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <XAxisAny dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#6b7280", fontSize: 12 }} />
          <YAxisAny allowDecimals={false} tick={{ fill: "#6b7280", fontSize: 12 }} />
          <Tooltip formatter={(v: any) => [v, "Chats"]} />
          <Bar dataKey="count" fill="#e0e7ff" radius={[4, 4, 4, 4]} />
          <Line type="monotone" dataKey="line" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6", strokeWidth: 2, r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
