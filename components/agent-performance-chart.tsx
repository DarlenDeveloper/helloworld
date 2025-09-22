"use client"

import { useEffect, useMemo, useState } from "react"
import { Bar, XAxis, YAxis, ResponsiveContainer, Line, ComposedChart, Tooltip } from "recharts"
import { createClient } from "@/lib/supabase/client"

// Recharts type compatibility shim for React 19/TS 5
// Avoid TS errors about JSX element class not supporting attributes
const XAxisAny: any = XAxis
const YAxisAny: any = YAxis

export type CallsPeriod = "weekly" | "monthly"

interface Point {
  label: string
  count: number
  line: number
}

export function AgentPerformanceChart({ period = "weekly" }: { period?: CallsPeriod }) {
  const [data, setData] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const labels = useMemo(() => {
    const now = new Date()
    if (period === "weekly") {
      // last 7 days (today - 6 .. today)
      const arr: string[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(now.getDate() - i)
        arr.push(d.toLocaleDateString(undefined, { weekday: "short" }))
      }
      return arr
    } else {
      // last 12 months (including current)
      const arr: string[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now)
        d.setMonth(now.getMonth() - i)
        arr.push(d.toLocaleDateString(undefined, { month: "short" }))
      }
      return arr
    }
  }, [period])

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        // Compute start date based on period
        const now = new Date()
        let start: Date
        if (period === "weekly") {
          start = new Date(now)
          start.setDate(now.getDate() - 6)
          start.setHours(0, 0, 0, 0)
        } else {
          start = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0)
        }

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setData([]); setLoading(false); return }

        // Resolve owners set (self + owners where I'm an active member)
        const owners: string[] = [user.id]
        const { data: memberships } = await supabase
          .from("account_users")
          .select("owner_user_id, is_active")
          .eq("member_user_id", user.id)
          .eq("is_active", true)
        ;(memberships || []).forEach((m: any) => {
          const oid = String(m?.owner_user_id || "")
          if (oid && !owners.includes(oid)) owners.push(oid)
        })

        const { data: rows, error } = await supabase
          .from("calls")
          .select("created_at")
          .in("user_id", owners)
          .gte("created_at", start.toISOString())

        if (error) throw error

        if (period === "weekly") {
          const buckets = new Array(7).fill(0)
          ;(rows || []).forEach((r: any) => {
            const d = new Date(r.created_at)
            const startDay = new Date(start)
            const msPerDay = 24 * 3600 * 1000
            const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
            const offset = Math.floor((dayStart.getTime() - startDay.getTime()) / msPerDay)
            if (offset >= 0 && offset < 7) buckets[offset] += 1
          })
          const points: Point[] = buckets.map((n, idx) => ({ label: labels[idx], count: n, line: n }))
          setData(points)
        } else {
          const buckets = new Array(12).fill(0)
          ;(rows || []).forEach((r: any) => {
            const d = new Date(r.created_at)
            const monthsDiff = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth())
            if (monthsDiff >= 0 && monthsDiff < 12) buckets[monthsDiff] += 1
          })
          const points: Point[] = buckets.map((n, idx) => ({ label: labels[idx], count: n, line: n }))
          setData(points)
        }
      } catch (e) {
        console.error("Failed to fetch calls data:", e)
        setData([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()

    const channel = supabase
      .channel("calls-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, () => {
        fetchData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, period, labels])

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-pulse h-40 w-full bg-gray-200 rounded"></div>
      </div>
    )
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <XAxisAny dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#6b7280", fontSize: 12 }} />
          <YAxisAny allowDecimals={false} tick={{ fill: "#6b7280", fontSize: 12 }} />
          <Tooltip formatter={(v: any) => [v, "Calls"]} />
          <Bar dataKey="count" fill="#e0e7ff" radius={[4, 4, 4, 4]} />
          <Line type="monotone" dataKey="line" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", strokeWidth: 2, r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
