"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Category { id: string; name: string; slug: string }
interface Event { id: string; text: string; created_at: string }

export default function TalkingPointsCategoryPage() {
  const supabase = createClient()
  const params = useParams<{ slug: string }>()
  const slug = params?.slug

  const [cat, setCat] = useState<Category | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState("")

  useEffect(() => {
    const init = async () => {
      if (!slug) return
      setLoading(true)
      const { data: c } = await supabase
        .from("talking_points_categories")
        .select("id,name,slug")
        .eq("slug", slug)
        .single()
      if (!c) { setLoading(false); return }
      setCat(c as any)

      const { data: ev } = await supabase
        .from("talking_points_events")
        .select("id,text,created_at")
        .eq("category_id", (c as any).id)
        .order("created_at", { ascending: false })
        .limit(100)
      setEvents((ev || []) as any)

      const channel = supabase
        .channel("tpe_cat")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "talking_points_events", filter: `category_id=eq.${(c as any).id}` }, (payload) => {
          setEvents((prev) => [{ id: (payload.new as any).id, text: (payload.new as any).text, created_at: (payload.new as any).created_at }, ...prev])
        })
        .subscribe()

      setLoading(false)
      return () => {
        supabase.removeChannel(channel)
      }
    }
    init()
  }, [supabase, slug])

  const addEvent = async () => {
    if (!cat) return
    const t = text.trim()
    if (!t) return
    await supabase.from("talking_points_events").insert({ category_id: cat.id, text: t })
    setText("")
  }

  if (loading) return <div className="p-6">Loading...</div>
  if (!cat) return <div className="p-6">Category not found</div>

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black">{cat.name}</h1>
        <p className="text-gray-600">Realtime talking points stream</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Add Talking Point</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input placeholder={`Add ${cat.name} note...`} value={text} onChange={(e) => setText(e.target.value)} />
            <Button onClick={addEvent}>Add</Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 space-y-3">
        {events.map((e) => (
          <Card key={e.id}>
            <CardContent className="py-3 text-sm flex items-center justify-between">
              <span className="text-gray-800">{e.text || "(no text)"}</span>
              <span className="text-gray-500">{new Date(e.created_at).toLocaleString()}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
