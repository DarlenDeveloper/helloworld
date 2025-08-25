"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Search, Plus, Edit, Trash2, Eye } from "lucide-react"

interface Article {
  id: string
  user_id: string
  title: string
  content: string
  category: string | null
  tags: string[] | null
  status: "draft" | "published" | "archived"
  views: number
  created_at: string
  updated_at: string
}

export default function KnowledgeBasePage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [articles, setArticles] = useState<Article[]>([])
  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isViewerOpen, setIsViewerOpen] = useState(false)
  const [editing, setEditing] = useState<Article | null>(null)
  const [viewing, setViewing] = useState<Article | null>(null)
  const [form, setForm] = useState({
    title: "",
    content: "",
    category: "General",
    tags: "",
    status: "draft" as Article["status"],
  })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await fetchArticles(user.id)

      const channel = supabase
        .channel("kb_articles_changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "knowledge_base_articles" }, () => {
          fetchArticles(user.id)
        })
        .subscribe()
      return () => {
        supabase.removeChannel(channel)
      }
    }
    init().finally(() => setLoading(false))
  }, [supabase])

  const fetchArticles = async (userId: string) => {
    const { data, error } = await supabase
      .from("knowledge_base_articles")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })

    if (error) {
      console.error("Failed to fetch knowledge base articles:", error)
      return
    }
    setArticles((data || []) as Article[])
  }

  const resetForm = () => {
    setEditing(null)
    setForm({ title: "", content: "", category: "General", tags: "", status: "draft" })
  }

  const openCreate = () => {
    resetForm()
    setIsEditorOpen(true)
  }

  const openEdit = (a: Article) => {
    setEditing(a)
    setForm({
      title: a.title,
      content: a.content,
      category: a.category || "General",
      tags: (a.tags || []).join(", "),
      status: a.status,
    })
    setIsEditorOpen(true)
  }

  const saveArticle = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      user_id: user.id,
      title: form.title.trim(),
      content: form.content,
      category: form.category?.trim() || null,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      status: form.status,
    }

    if (!payload.title) {
      alert("Title is required")
      return
    }
    if (!payload.content) {
      alert("Content is required")
      return
    }

    if (editing) {
      const { error } = await supabase
        .from("knowledge_base_articles")
        .update(payload)
        .eq("id", editing.id)
        .eq("user_id", user.id)

      if (error) {
        console.error("Update failed:", error)
        alert("Failed to update article")
        return
      }
    } else {
      const { error } = await supabase
        .from("knowledge_base_articles")
        .insert(payload)

      if (error) {
        console.error("Insert failed:", error)
        alert("Failed to create article")
        return
      }
    }

    setIsEditorOpen(false)
    resetForm()
    await fetchArticles(user.id)
  }

  const deleteArticle = async (a: Article) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    if (!confirm(`Delete article "${a.title}"?`)) return

    const { error } = await supabase
      .from("knowledge_base_articles")
      .delete()
      .eq("id", a.id)
      .eq("user_id", user.id)

    if (error) {
      console.error("Delete failed:", error)
      alert("Failed to delete article")
      return
    }
    await fetchArticles(user.id)
  }

  const filtered = useMemo(() => {
    return articles.filter((a) => {
      const matchesQuery =
        a.title.toLowerCase().includes(query.toLowerCase()) ||
        a.content.toLowerCase().includes(query.toLowerCase()) ||
        (a.tags || []).some((t) => t.toLowerCase().includes(query.toLowerCase()))
      const matchesCategory = categoryFilter === "all" || (a.category || "").toLowerCase() === categoryFilter
      const matchesStatus = statusFilter === "all" || a.status === statusFilter
      return matchesQuery && matchesCategory && matchesStatus
    })
  }, [articles, query, categoryFilter, statusFilter])

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="text-gray-600">Loading knowledge base...</div>
      </div>
    )
  }

  const categories = Array.from(new Set(["General", ...articles.map((a) => a.category || "General")]))

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-black mb-2">Knowledge Base</h1>
            <p className="text-gray-600">Create and manage articles for your agents and customers</p>
          </div>
          <Button onClick={openCreate} className="bg-teal-600 hover:bg-teal-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            New Article
          </Button>
        </div>

        <Tabs defaultValue="articles" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 bg-gray-100">
            <TabsTrigger value="articles" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
              Articles
            </TabsTrigger>
            <TabsTrigger value="manage" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
              Manage
            </TabsTrigger>
          </TabsList>

          <TabsContent value="articles" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-black">Browse Articles</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search by title, content, or tag..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.toLowerCase()} value={c.toLowerCase()}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {filtered.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">No articles found.</div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filtered.map((a) => (
                      <Card key={a.id} className="border-gray-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg text-black">{a.title}</CardTitle>
                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" onClick={() => { setViewing(a); setIsViewerOpen(true) }} className="h-8 w-8 p-0 text-gray-600 hover:text-teal-600">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => openEdit(a)} className="h-8 w-8 p-0 text-gray-600 hover:text-teal-600">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteArticle(a)} className="h-8 w-8 p-0 text-gray-600 hover:text-red-600">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-xs text-gray-500 mb-2 flex gap-2 items-center">
                            <Badge variant="secondary" className="capitalize">{a.category || "General"}</Badge>
                            <Badge variant="outline" className="capitalize">{a.status}</Badge>
                            <span className="ml-auto">{new Date(a.updated_at).toLocaleDateString()}</span>
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-3">{a.content}</p>
                          <div className="mt-2 flex gap-1 flex-wrap">
                            {(a.tags || []).map((t) => (
                              <Badge key={t} variant="outline" className="text-2xs">#{t}</Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manage" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-black">Create or Edit Article</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div>
                    <label className="text-sm font-medium text-black mb-2 block">Title</label>
                    <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Enter article title" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-black mb-2 block">Category</label>
                    <Input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} placeholder="e.g., General, Support, Sales" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-black mb-2 block">Tags (comma separated)</label>
                    <Input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} placeholder="e.g., refunds, pricing, onboarding" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-black mb-2 block">Status</label>
                    <Select value={form.status} onValueChange={(v: Article["status"]) => setForm((p) => ({ ...p, status: v }))}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-black mb-2 block">Content</label>
                    <Textarea value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} rows={10} placeholder="Write detailed content here..." />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => { setIsEditorOpen(false); resetForm() }}>Cancel</Button>
                    <Button onClick={saveArticle} className="bg-teal-600 hover:bg-teal-700">{editing ? "Update" : "Create"}</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Editor Modal (for quick create/edit) */}
        <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-black">{editing ? "Edit Article" : "Create Article"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium text-black mb-2 block">Title</label>
                <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Enter article title" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-black mb-2 block">Category</label>
                  <Input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} placeholder="e.g., General" />
                </div>
                <div>
                  <label className="text-sm font-medium text-black mb-2 block">Status</label>
                  <Select value={form.status} onValueChange={(v: Article["status"]) => setForm((p) => ({ ...p, status: v }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-black mb-2 block">Tags (comma separated)</label>
                <Input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} placeholder="e.g., refunds, pricing, onboarding" />
              </div>
              <div>
                <label className="text-sm font-medium text-black mb-2 block">Content</label>
                <Textarea value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} rows={10} placeholder="Write detailed content here..." />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setIsEditorOpen(false); resetForm() }}>Cancel</Button>
                <Button onClick={saveArticle} className="bg-teal-600 hover:bg-teal-700">{editing ? "Update" : "Create"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Viewer Modal */}
        <Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-black">{viewing?.title}</DialogTitle>
            </DialogHeader>
            {viewing && (
              <div className="space-y-4">
                <div className="text-xs text-gray-500 flex gap-2 items-center">
                  <Badge variant="secondary" className="capitalize">{viewing.category || "General"}</Badge>
                  <Badge variant="outline" className="capitalize">{viewing.status}</Badge>
                  <span className="ml-auto">{new Date(viewing.updated_at).toLocaleString()}</span>
                </div>
                <div className="prose max-w-none whitespace-pre-wrap text-gray-800 text-sm">
                  {viewing.content}
                </div>
                <div className="flex gap-1 flex-wrap">
                  {(viewing.tags || []).map((t) => (
                    <Badge key={t} variant="outline" className="text-2xs">#{t}</Badge>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
