"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, Plus, Calendar as CalendarIcon, Edit, Trash2, Users, Play } from "lucide-react"
import { format } from "date-fns"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

// DB types (subset) aligned with simple schema
interface DbContactBatch {
  id: string
  user_id: string
  name: string
  description: string | null
  contact_count: number
  created_at: string
  updated_at: string
}

interface DbContact {
  id: string
  user_id: string
  name: string | null
  email: string | null
  phone: string | null
  notes: string | null
}

interface DbCampaign {
  id: string
  user_id: string
  name: string
  description: string | null
  status: "draft" | "active" | "paused" | "completed"
  target_contacts: number | null
  completed_calls: number | null
  success_rate: number | null
  created_at: string
  updated_at: string
}

export default function EmailSchedulingPage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const [contactBatches, setContactBatches] = useState<DbContactBatch[]>([])
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null)
  const [selectedBatchContacts, setSelectedBatchContacts] = useState<DbContact[]>([])

  const [campaigns, setCampaigns] = useState<DbCampaign[]>([])
  const [isCreateCampaignOpen, setIsCreateCampaignOpen] = useState(false)
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false)

  const [campaignForm, setCampaignForm] = useState({
    name: "",
    subject: "",
    body: "",
    sendIntervalSeconds: 1,
    selectedBatches: [] as string[],
  })

  // start campaign state
  const [startingCampaignId, setStartingCampaignId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number } | null>(null)

  // Manual add dialog state
  const [isAddContactOpen, setIsAddContactOpen] = useState(false)
  const [manualContact, setManualContact] = useState<{ name: string; phone: string; email: string; notes: string }>(
    { name: "", phone: "", email: "", notes: "" }
  )

  // Derived map for quick lookups
  const batchMap = useMemo(() => {
    const m = new Map<string, DbContactBatch>()
    contactBatches.forEach((b) => m.set(b.id, b))
    return m
  }, [contactBatches])

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) throw error
        if (!user) {
          router.push("/auth")
          return
        }
        setUser(user)
        await Promise.all([fetchBatches(user.id), fetchCampaigns(user.id)])
      } catch (e) {
        console.error("Failed to initialize Email scheduling page:", e)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [supabase, router])

  const fetchBatches = async (userId: string) => {
    const { data, error } = await supabase
      .from("email_contact_batches")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching contact batches:", error)
      return
    }
    setContactBatches(data || [])
  }

  const fetchBatchContacts = async (batchId: string) => {
    // Read snapshot contact data directly from batch_contacts
    const { data, error } = await supabase
      .from("email_batch_contacts")
      .select("contact_id, name, email, phone, notes")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching batch_contacts:", error)
      setSelectedBatchContacts([])
      return
    }

    const mapped: DbContact[] = (data || []).map((r: any) => ({
      id: r.contact_id,
      user_id: user?.id || "",
      name: r.name,
      email: r.email,
      phone: r.phone,
      notes: r.notes,
    }))
    setSelectedBatchContacts(mapped)
  }

  const fetchCampaigns = async (userId: string) => {
    const { data, error } = await supabase
      .from("email_campaigns")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching campaigns:", error)
      return
    }
    setCampaigns(data as DbCampaign[] || [])
  }

  const handleCreateBatch = async () => {
    if (!user) return
    const defaultName = `New Batch ${contactBatches.length + 1}`

    const { data, error } = await supabase
      .from("email_contact_batches")
      .insert({ user_id: user.id, name: defaultName, description: null })
      .select("*")
      .single()

    if (error) {
      console.error("Failed to create contact batch:", error)
      alert("Failed to create batch")
      return
    }

    setContactBatches((prev) => [data as DbContactBatch, ...prev])
  }

  const handleDeleteBatch = async (batchId: string) => {
    if (!user) return
    if (!confirm("Delete this batch?")) return

    const { error } = await supabase
      .from("email_contact_batches")
      .delete()
      .eq("id", batchId)
      .eq("user_id", user.id)

    if (error) {
      console.error("Failed to delete batch:", error)
      alert("Failed to delete batch")
      return
    }

    setContactBatches((prev) => prev.filter((b) => b.id !== batchId))
    if (selectedBatch === batchId) {
      setSelectedBatch(null)
      setSelectedBatchContacts([])
    }
  }

  const handleRenameBatch = async (batchId: string, newName: string) => {
    if (!user) return
    const { data, error } = await supabase
      .from("email_contact_batches")
      .update({ name: newName })
      .eq("id", batchId)
      .eq("user_id", user.id)
      .select("*")
      .single()

    if (error) {
      console.error("Failed to rename batch:", error)
      alert("Failed to rename batch")
      return
    }

    setContactBatches((prev) => prev.map((b) => (b.id === batchId ? (data as DbContactBatch) : b)))
  }

  const handleBatchSelection = (batchId: string, checked: boolean) => {
    setCampaignForm((prev) => ({
      ...prev,
      selectedBatches: checked
        ? [...prev.selectedBatches, batchId]
        : prev.selectedBatches.filter((id) => id !== batchId),
    }))
  }

  const handleCreateCampaign = async () => {
    if (!user) return

    if (!campaignForm.name.trim()) {
      alert("Campaign name is required")
      return
    }

    if (campaignForm.selectedBatches.length === 0) {
      alert("Please select at least one contact batch")
      return
    }

    if (!campaignForm.subject.trim()) {
      alert("Email subject is required")
      return
    }

    if (!campaignForm.body.trim()) {
      alert("Email body is required")
      return
    }

    setIsCreatingCampaign(true)

    try {
      const totalContacts = campaignForm.selectedBatches.reduce((sum, id) => sum + (batchMap.get(id)?.contact_count || 0), 0)

      const ratePerSec = campaignForm.sendIntervalSeconds > 0 ? (1 / campaignForm.sendIntervalSeconds) : 1
      const description = `Channel: Email\nIntervalSeconds: ${campaignForm.sendIntervalSeconds}\nRateLimitPerSec: ${ratePerSec}\nSubject: ${campaignForm.subject}\nBody: ${campaignForm.body}`

      const { data: newCampaign, error } = await supabase
        .from("email_campaigns")
        .insert({
          user_id: user.id,
          name: campaignForm.name.trim(),
          description,
          status: "draft",
          target_contacts: totalContacts,
        })
        .select("*")
        .single()

      if (error || !newCampaign) {
        console.error("Failed to create campaign:", error)
        alert("Failed to create campaign")
        return
      }

      if (campaignForm.selectedBatches.length > 0) {
        const rows = campaignForm.selectedBatches.map((batchId) => ({ campaign_id: newCampaign.id, batch_id: batchId }))
        const { error: linkErr } = await supabase.from("email_campaign_batches").insert(rows)
        if (linkErr) {
          console.error("Failed to link campaign batches:", linkErr)
        }
      }

      setCampaigns((prev) => [newCampaign as DbCampaign, ...prev])
      setCampaignForm({ name: "", subject: "", body: "", selectedBatches: [] })
      setIsCreateCampaignOpen(false)
    } catch (err) {
      console.error("Error creating campaign:", err)
      alert("Failed to create campaign. Please try again.")
    } finally {
      setIsCreatingCampaign(false)
    }
  }

  const startCampaign = async (campaignId: string) => {
    setStartingCampaignId(campaignId)
    setStarting(true)
    try {
      const res = await fetch(`/api/email-campaigns/${campaignId}/start`, {
        method: "POST",
        // Optionally pass a channel-specific webhook_url here
        // body: JSON.stringify({ webhook_url: "https://your-email-webhook.example.com" }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Failed to start campaign (${res.status})`)
      }
      if (user) await fetchCampaigns(user.id)
    } catch (e: any) {
      alert(e.message || "Failed to start campaign")
    } finally {
      setStarting(false)
      setStartingCampaignId(null)
    }
  }

  useEffect(() => {
    if (selectedBatch) {
      fetchBatchContacts(selectedBatch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatch])

  // CSV import support
  const onClickImportCSV = () => fileInputRef.current?.click()

  const parseCSV = (text: string): { email: string; name?: string }[] => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return []

    // Detect header
    const hasHeader = /(^|,)\s*(email)\s*(,|$)/i.test(lines[0])
    const rows = hasHeader ? lines.slice(1) : lines

    const out: { email: string; name?: string }[] = []
    for (const line of rows) {
      const parts = line.split(",")
      const email = (parts[0] || "").trim()
      const name = (parts[1] || "").trim()
      if (!email) continue
      // light validation for email
      if (!/^\S+@\S+\.[\w-]+$/.test(email)) continue
      out.push({ email, name })
    }
    return out
  }

  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const res: T[][] = []
    for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size))
    return res
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !selectedBatch) return
    const file = e.target.files?.[0]
    e.target.value = "" // reset input value for future imports
    if (!file) return

    try {
      const text = await file.text()
      const parsed = parseCSV(text)
      const uniqueByEmail = Array.from(new Map(parsed.map((r) => [r.email.toLowerCase(), r])).values())
      if (uniqueByEmail.length === 0) {
        alert("No valid contacts found in CSV.")
        return
      }

      setImporting(true)
      setImportProgress({ processed: 0, total: uniqueByEmail.length })

      const CHUNK_SIZE = 500
      const chunks = chunk(uniqueByEmail, CHUNK_SIZE)
      let totalInserted = 0

      let allowedRemaining = Math.max(0, 1000 - (batchMap.get(selectedBatch)?.contact_count || 0))
      if (allowedRemaining === 0) {
        alert("This batch already has 1000 contacts.")
        return
      }

      for (let i = 0; i < chunks.length && allowedRemaining > 0; i++) {
        // Trim chunk to limit
        const c = chunks[i].slice(0, allowedRemaining)
        // Insert contacts
        const contactRows = c.map((r) => ({ user_id: user.id, name: r.name || null, email: r.email, phone: null, notes: null }))
        const { data: inserted, error: insErr } = await supabase
          .from("contacts")
          .insert(contactRows)
          .select("id")

        if (insErr) {
          console.error("Failed inserting contacts chunk:", insErr)
          alert("Failed to import some contacts. See console for details.")
          break
        }

        const linkRows = (inserted || []).map((row: any, idx: number) => ({
          batch_id: selectedBatch,
          contact_id: row.id,
          // snapshot from parsed chunk "c"
          name: c[idx]?.name || null,
          email: c[idx]?.email || null,
          phone: null,
          notes: null,
        }))
        if (linkRows.length > 0) {
          const { error: linkErr } = await supabase.from("email_batch_contacts").insert(linkRows)
          if (linkErr) {
            console.error("Failed linking batch contacts:", linkErr)
            alert("Failed to link some contacts to batch. See console for details.")
            break
          }
        }

        totalInserted += contactRows.length
        setImportProgress({ processed: Math.min(totalInserted, uniqueByEmail.length), total: uniqueByEmail.length })
      }

      // Update batch contact_count in DB and in memory
      if (totalInserted > 0) {
        await supabase
          .from("email_contact_batches")
          .update({ contact_count: (batchMap.get(selectedBatch)?.contact_count || 0) + totalInserted })
          .eq("id", selectedBatch)

        // Refresh batch in memory
        setContactBatches((prev) => prev.map((b) => (b.id === selectedBatch ? { ...b, contact_count: b.contact_count + totalInserted } : b)))
        await fetchBatchContacts(selectedBatch)
      }
    } catch (err) {
      console.error("Failed to import CSV:", err)
      alert("Failed to import CSV.")
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  const handleAddContact = async () => {
    if (!user || !selectedBatch) return
    const email = (manualContact.email || "").trim()
    if (!/^\S+@\S+\.[\w-]+$/.test(email)) {
      alert("Enter a valid email address")
      return
    }

    try {
      const { data: inserted, error } = await supabase
        .from("contacts")
        .insert({
          user_id: user.id,
          name: manualContact.name.trim() || null,
          email,
          phone: null,
          notes: manualContact.notes.trim() || null,
        })
        .select("id")
        .single()

      if (error || !inserted) {
        console.error("Failed to add contact:", error)
        alert("Failed to add contact")
        return
      }

      const { error: linkErr } = await supabase
        .from("email_batch_contacts")
        .insert({ batch_id: selectedBatch, contact_id: inserted.id, name: manualContact.name || null, email, phone: null, notes: manualContact.notes || null })
      if (linkErr) {
        console.error("Failed linking contact to batch:", linkErr)
        alert("Failed to link contact to batch")
        return
      }

      // Update counts/UI
      setContactBatches((prev) => prev.map((b) => (b.id === selectedBatch ? { ...b, contact_count: b.contact_count + 1 } : b)))
      await fetchBatchContacts(selectedBatch)
      setIsAddContactOpen(false)
      setManualContact({ name: "", phone: "", email: "", notes: "" })
    } catch (e) {
      console.error("Error adding contact:", e)
      alert("Error adding contact")
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-gray-600">Loading Email scheduling...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-black">Email Scheduling</h1>
            <p className="text-gray-600 mt-2">Manage contact batches and create outbound Email campaigns</p>
            <p className="text-xs text-gray-500 mt-1">Dispatch interval: configurable (default 1s)</p>
          </div>
          <div className="flex gap-4">
            <Button variant="outline" className="border-gray-300 bg-transparent" onClick={handleCreateBatch}>
              <Plus className="h-4 w-4 mr-2" />
              New Batch
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
            <Button variant="outline" className="border-gray-300 bg-transparent" onClick={onClickImportCSV} disabled={!selectedBatch || importing}>
              <Upload className="h-4 w-4 mr-2" />
              {importing && importProgress ? `Importing ${importProgress.processed}/${importProgress.total}` : "Import CSV"}
            </Button>
            <Dialog open={isCreateCampaignOpen} onOpenChange={setIsCreateCampaignOpen}>
              <DialogTrigger asChild>
                <Button className="bg-teal-500 hover:bg-teal-600 text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Campaign
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Email Campaign</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                  {/* Campaign Name */}
                  <div className="space-y-2">
                    <Label htmlFor="campaign-name">Campaign Name *</Label>
                    <Input id="campaign-name" placeholder="Enter campaign name" value={campaignForm.name} onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))} />
                  </div>

                  {/* Contact Batches */}
                  <div className="space-y-2">
                    <Label>Select Contact Batches *</Label>
                    <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                      {contactBatches.length === 0 && (
                        <div className="text-sm text-gray-500">No batches yet. Create one to get started.</div>
                      )}
                      {contactBatches.map((batch) => (
                        <div key={batch.id} className="flex items-center space-x-2">
                          <Checkbox id={`batch-${batch.id}`} checked={campaignForm.selectedBatches.includes(batch.id)} onCheckedChange={(checked) => handleBatchSelection(batch.id, checked as boolean)} />
                          <Label htmlFor={`batch-${batch.id}`} className="flex-1 cursor-pointer">
                            {batch.name} ({batch.contact_count} contacts)
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Email Subject */}
                  <div className="space-y-2">
                    <Label htmlFor="campaign-subject">Email Subject *</Label>
                    <Input id="campaign-subject" placeholder="Subject line" value={campaignForm.subject} onChange={(e) => setCampaignForm((prev) => ({ ...prev, subject: e.target.value }))} />
                  </div>

                  {/* Email Body */}
                  <div className="space-y-2">
                    <Label htmlFor="campaign-body">Email Body *</Label>
                    <Textarea id="campaign-body" placeholder="Write your email body (supports variables like {{name}})" rows={6} value={campaignForm.body} onChange={(e) => setCampaignForm((prev) => ({ ...prev, body: e.target.value }))} />
                  </div>

                  {/* Send interval */}
                  <div className="space-y-2">
                    <Label htmlFor="send-interval">Send interval (seconds)</Label>
                    <Input id="send-interval" type="number" min={1} step={1} value={campaignForm.sendIntervalSeconds} onChange={(e) => setCampaignForm((prev) => ({ ...prev, sendIntervalSeconds: Math.max(1, Number(e.target.value) || 1) }))} />
                    <div className="text-xs text-gray-500">One email will be sent every <span className="font-medium">{campaignForm.sendIntervalSeconds}</span> second(s).</div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setIsCreateCampaignOpen(false)} disabled={isCreatingCampaign}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateCampaign} disabled={isCreatingCampaign} className="bg-teal-500 hover:bg-teal-600">
                      {isCreatingCampaign ? "Creating..." : "Create Campaign"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Contact Batches */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {selectedBatch ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedBatch(null)}>
                        ← Back
                      </Button>
                      <CardTitle className="text-black">{batchMap.get(selectedBatch)?.name || "Contacts"}</CardTitle>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={onClickImportCSV} disabled={importing}>
                        <Upload className="h-4 w-4 mr-2" />
                        {importing && importProgress ? `Importing ${importProgress.processed}/${importProgress.total}` : "Import CSV"}
                      </Button>
                      <Dialog open={isAddContactOpen} onOpenChange={setIsAddContactOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Contact
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Add Contact</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-3">
                            <div>
                              <Label htmlFor="add-name">Name (optional)</Label>
                              <Input id="add-name" value={manualContact.name} onChange={(e) => setManualContact((p) => ({ ...p, name: e.target.value }))} />
                            </div>
                            <div>
                              <Label htmlFor="add-email">Email *</Label>
                              <Input id="add-email" type="email" value={manualContact.email} onChange={(e) => setManualContact((p) => ({ ...p, email: e.target.value }))} placeholder="e.g., johndoe@example.com" />
                            </div>
                            <div>
                              <Label htmlFor="add-phone">Phone (optional)</Label>
                              <Input id="add-phone" value={manualContact.phone} onChange={(e) => setManualContact((p) => ({ ...p, phone: e.target.value }))} />
                            </div>
                            <div>
                              <Label htmlFor="add-notes">Notes (optional)</Label>
                              <Textarea id="add-notes" rows={3} value={manualContact.notes} onChange={(e) => setManualContact((p) => ({ ...p, notes: e.target.value }))} />
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" onClick={() => setIsAddContactOpen(false)}>Cancel</Button>
                              <Button onClick={handleAddContact} className="bg-teal-500 hover:bg-teal-600">Add</Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {selectedBatchContacts.length === 0 && (
                      <div className="text-sm text-gray-500">No contacts in this batch yet.</div>
                    )}
                    {selectedBatchContacts.map((contact) => (
                      <div key={contact.id} className="flex items-center gap-4 p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-black">{contact.name || contact.email || "Unknown"}</span>
                          </div>
                          <div className="text-sm text-gray-600">
                            {(contact.email || "No email")} • {(contact.phone || "No phone")} • {(contact.notes || "No notes")}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" disabled>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600" disabled>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-black">Contact Batches</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {contactBatches.length === 0 && (
                      <div className="text-sm text-gray-500">No contact batches yet. Create one to get started.</div>
                    )}
                    {contactBatches.map((batch) => (
                      <div key={batch.id} className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedBatch(batch.id) }}>
                        <Users className="h-5 w-5 text-teal-600" />
                        <div className="flex-1">
                          <div className="font-medium text-black">{batch.name}</div>
                          <div className="text-sm text-gray-600">{batch.contact_count} contacts • Created {format(new Date(batch.created_at), "MMM d, yyyy")}</div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); const newName = prompt("Enter new batch name:", batch.name); if (newName && newName.trim()) handleRenameBatch(batch.id, newName.trim()) }}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600" onClick={(e) => { e.stopPropagation(); handleDeleteBatch(batch.id) }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Campaign List */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-black">Campaigns</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {campaigns.length === 0 && (
                    <div className="text-sm text-gray-500">No campaigns yet. Create one to get started.</div>
                  )}
                  {campaigns.map((campaign) => (
                    <div key={campaign.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-medium text-black">{campaign.name}</h3>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-blue-100 text-blue-800 capitalize">{campaign.status}</Badge>
                          {campaign.status !== "active" && (
                            <Button size="sm" onClick={() => startCampaign(campaign.id)} disabled={starting && startingCampaignId === campaign.id} className="bg-teal-500 hover:bg-teal-600">
                              <Play className="h-4 w-4 mr-1" /> {starting && startingCampaignId === campaign.id ? "Starting..." : "Start"}
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex items-center gap-2"><Users className="h-4 w-4" />{campaign.target_contacts ?? 0} contacts</div>
                        <div className="flex items-center gap-2"><CalendarIcon className="h-4 w-4" />Created {format(new Date(campaign.created_at), "MMM d, yyyy")}</div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const m = (campaign.description || '').match(/^\s*IntervalSeconds\s*:\s*(.+)$/mi)
                            const s = m ? Number((m[1] || '').trim()) : 1
                            const interval = (!Number.isNaN(s) && s > 0) ? s : 1
                            const total = Math.max(0, (campaign.target_contacts ?? 0) * interval)
                            const hh = Math.floor(total / 3600)
                            const mm = Math.floor((total % 3600) / 60)
                            const ss = Math.floor(total % 60)
                            const pad = (n: number) => n.toString().padStart(2, '0')
                            return <span>Est. time: {hh > 0 ? `${hh}:` : ''}{pad(mm)}:{pad(ss)}</span>
                          })()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
