"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Category {
  id: string
  name: string
  slug: string
}

export default function TalkingPointsPage() {
  const supabase = createClient()
  const [cats, setCats] = useState<Category[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [quickAdd, setQuickAdd] = useState<{ [k: string]: string }>({})

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      const { data: c } = await supabase.from("talking_points_categories").select("id,name,slug").order("name")
      setCats((c || []) as Category[])

      // initial counts
      const newCounts: Record<string, number> = {}
      for (const cat of c || []) {
        const { count } = await supabase
          .from("talking_points_events")
          .select("id", { count: "exact", head: true })
          .eq("category_id", (cat as any).id)
        newCounts[(cat as any).id] = count || 0
      }
      setCounts(newCounts)

      // realtime: subscribe to events
      const channel = supabase
        .channel("tpe")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "talking_points_events" }, (payload) => {
          const catId = (payload.new as any).category_id as string
          setCounts((prev) => ({ ...prev, [catId]: (prev[catId] || 0) + 1 }))
        })
        .subscribe()

      setLoading(false)
      return () => {
        supabase.removeChannel(channel)
      }
    }
    init()
  }, [supabase])

  const handleQuickAdd = async (catId: string) => {
    const text = (quickAdd[catId] || "").trim()
    if (!text) return
    await supabase.from("talking_points_events").insert({ category_id: catId, text })
    setQuickAdd((p) => ({ ...p, [catId]: "" }))
  }

  if (loading) return <div className="p-6">Loading talking points...</div>

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black">Talking Points</h1>
        <p className="text-gray-600">Categories and realtime counts</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cats.map((cat) => (
          <Card key={cat.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="text-black">{cat.name}</span>
                <span className="text-sm text-gray-600">{counts[cat.id] || 0}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder={`Add ${cat.name} note...`}
                  value={quickAdd[cat.id] || ""}
                  onChange={(e) => setQuickAdd((p) => ({ ...p, [cat.id]: e.target.value }))}
                />
                <Button onClick={() => handleQuickAdd(cat.id)}>Add</Button>
              </div>
              <Link href={`/talking-points/${cat.slug}`} className="text-teal-600 hover:text-teal-700 text-sm">View details</Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
