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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

export default function SchedulingPage() {
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
    concurrentCalls: 3,
    prompt: "",
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

  const phoneValidation = useMemo(() => {
    const raw = manualContact.phone.trim()
    if (!raw) return { valid: false, normalized: "", touched: false }
    const normalized = normalizePhone(raw)
    return { valid: isValidPhone(normalized), normalized, touched: true }
  }, [manualContact.phone])

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
        console.error("Failed to initialize scheduling page:", e)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [supabase, router])

  const fetchBatches = async (userId: string) => {
    const { data, error } = await supabase
      .from("contact_batches")
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
      .from("batch_contacts")
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
      .from("campaigns")
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
      .from("contact_batches")
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
      .from("contact_batches")
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
      .from("contact_batches")
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

    if (!campaignForm.prompt.trim()) {
      alert("Campaign prompt is required")
      return
    }

    setIsCreatingCampaign(true)

    try {
      // Count only valid phone numbers across selected batches (exclude invalid)
      const batchIds = campaignForm.selectedBatches
      let totalContacts = 0
      for (const id of batchIds) {
        const { count, error: cntErr } = await supabase
          .from("batch_contacts")
          .select("id", { count: "exact", head: true })
          .eq("batch_id", id)
          .not("phone", "is", null)
          .filter("phone", "regex", "^(?:\\+256\\d{9}|\\+[1-9]\\d{7,14})$")
        if (!cntErr) totalContacts += count || 0
      }

      const description = `Prompt: ${campaignForm.prompt}\nConcurrent Calls: ${campaignForm.concurrentCalls}`

      const { data: newCampaign, error } = await supabase
        .from("campaigns")
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
        const { error: linkErr } = await supabase.from("campaign_batches").insert(rows)
        if (linkErr) {
          console.error("Failed to link campaign batches:", linkErr)
        }
      }

      setCampaigns((prev) => [newCampaign as DbCampaign, ...prev])
      setCampaignForm({ name: "", concurrentCalls: 3, prompt: "", selectedBatches: [] })
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
      const res = await fetch(`/api/campaigns/${campaignId}/start`, {
        method: "POST",
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

  const normalizePhone = (raw: string) => {
    let s = (raw || "").trim()
    // remove common separators/spaces
    s = s.replace(/[\s\-().]/g, "")
    // convert leading 00 to +
    if (s.startsWith("00")) s = "+" + s.slice(2)
    // if no + but only digits and plausible length, prefix +
    if (!s.startsWith("+") && /^\d{8,15}$/.test(s)) s = "+" + s
    return s
  }

  const isValidPhone = (phone: string) => {
    const p = (phone || "").trim()
    // General E.164
    if (!/^\+[1-9]\d{7,14}$/.test(p)) return false
    // Uganda specific: +256 followed by exactly 9 digits (total length 13)
    if (p.startsWith("+256")) return /^\+256\d{9}$/.test(p)
    return true
  }

  type ParsedPhones = { valid: { phone: string; notes: string }[]; invalid: string[] }

  const parseCSV = (text: string): ParsedPhones => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return { valid: [], invalid: [] }

    // Detect header (contact/phone/number in first column)
    const hasHeader = /(^|,)\s*(contact|phone|number)\s*(,|$)/i.test(lines[0])
    const rows = hasHeader ? lines.slice(1) : lines

    const valid: { phone: string; notes: string }[] = []
    const invalid: string[] = []
    for (const line of rows) {
      const parts = line.split(",")
      const phoneRaw = (parts[0] || "").trim()
      const notes = (parts[1] || "").trim()
      if (!phoneRaw) continue
      const phone = normalizePhone(phoneRaw)
      if (!isValidPhone(phone)) {
        invalid.push(phoneRaw)
        continue
      }
      valid.push({ phone, notes })
    }
    return { valid, invalid }
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
      if (parsed.invalid.length > 0) {
        const sample = parsed.invalid.slice(0, 10).join(", ")
        alert(`Invalid phone numbers skipped (${parsed.invalid.length}): ${sample}${parsed.invalid.length > 10 ? "..." : ""}`)
      }
      const uniqueByPhone = Array.from(new Map(parsed.valid.map((r) => [r.phone, r])).values())
      if (uniqueByPhone.length === 0) {
        alert("No valid contacts found in CSV.")
        return
      }

      setImporting(true)
      setImportProgress({ processed: 0, total: uniqueByPhone.length })

      const CHUNK_SIZE = 500
      const chunks = chunk(uniqueByPhone, CHUNK_SIZE)
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
        const contactRows = c.map((r) => ({ user_id: user.id, name: null, email: null, phone: r.phone, notes: r.notes || null }))
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
          name: null,
          email: null,
          phone: c[idx]?.phone || null,
          notes: c[idx]?.notes || null,
        }))
        if (linkRows.length > 0) {
          const { error: linkErr } = await supabase.from("batch_contacts").insert(linkRows)
          if (linkErr) {
            console.error("Failed linking batch contacts:", linkErr)
            alert("Failed to link some contacts to batch. See console for details.")
            break
          }
        }

        totalInserted += contactRows.length
        setImportProgress({ processed: Math.min(totalInserted, uniqueByPhone.length), total: uniqueByPhone.length })
      }

      // Update batch contact_count in DB and in memory
      if (totalInserted > 0) {
        await supabase
          .from("contact_batches")
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
    const raw = manualContact.phone.trim()
    const normalized = normalizePhone(raw)
    if (!isValidPhone(normalized)) {
      alert("Enter a valid phone number in E.164 format (e.g., +256778825312)")
      return
    }

    try {
      const { data: inserted, error } = await supabase
        .from("contacts")
        .insert({
          user_id: user.id,
          name: manualContact.name.trim() || null,
          email: manualContact.email.trim() || null,
          phone: normalized,
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
        .from("batch_contacts")
        .insert({ batch_id: selectedBatch, contact_id: inserted.id, name: manualContact.name || null, email: manualContact.email || null, phone: normalized, notes: manualContact.notes || null })
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
          <div className="text-gray-600">Loading scheduling...</div>
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
            <h1 className="text-3xl font-bold text-black">Call Scheduling</h1>
            <p className="text-gray-600 mt-2">Manage contact batches and create outbound call campaigns</p>
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
              <DialogContent className="max-w-2xl" aria-describedby="create-campaign-desc">
                <DialogHeader>
                  <DialogTitle id="create-campaign-title">Create New Campaign</DialogTitle>
                </DialogHeader>
                <div className="sr-only" id="create-campaign-desc">
                  Fill out the campaign details including name, concurrency, contact batches, and prompt.
                </div>
                <div role="document" aria-labelledby="create-campaign-title" className="space-y-6">
                  {/* Campaign Name */}
                  <div className="space-y-2">
                    <Label htmlFor="campaign-name">Campaign Name *</Label>
                    <Input
                      id="campaign-name"
                      placeholder="Enter campaign name"
                      value={campaignForm.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCampaignForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                  </div>

                  {/* Concurrent Calls */}
                  <div className="space-y-2">
                    <Label htmlFor="concurrent-calls">Concurrent Calls</Label>
                    <Select
                      value={campaignForm.concurrentCalls.toString()}
                      onValueChange={(value: string) =>
                        setCampaignForm((prev) => ({ ...prev, concurrentCalls: Number.parseInt(value) }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3</SelectItem>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                      </SelectContent>
                    </Select>
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
                          <Checkbox
                            id={`batch-${batch.id}`}
                            checked={campaignForm.selectedBatches.includes(batch.id)}
                            onCheckedChange={(checked: boolean | "indeterminate") =>
                              handleBatchSelection(batch.id, Boolean(checked) && checked !== "indeterminate")
                            }
                          />
                          <Label htmlFor={`batch-${batch.id}`} className="flex-1 cursor-pointer">
                            {batch.name} ({batch.contact_count} contacts)
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Campaign Prompt */}
                  <div className="space-y-2">
                    <Label htmlFor="campaign-prompt">Campaign Prompt *</Label>
                    <Textarea
                      id="campaign-prompt"
                      placeholder="Enter the script or prompt for this campaign..."
                      rows={4}
                      value={campaignForm.prompt}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setCampaignForm((prev) => ({ ...prev, prompt: e.target.value }))
                      }
                    />
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
                        <DialogContent className="max-w-md" aria-describedby="add-contact-desc">
                          <DialogHeader>
                            <DialogTitle id="add-contact-title">Add Contact</DialogTitle>
                          </DialogHeader>
                          <div className="sr-only" id="add-contact-desc">
                            Enter the contact details including phone number in E.164 format, optionally name, email, and notes.
                          </div>
                          <div role="document" aria-labelledby="add-contact-title" className="space-y-3">
                            <div>
                              <Label htmlFor="add-name">Name (optional)</Label>
                              <Input
                                id="add-name"
                                value={manualContact.name}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setManualContact((p) => ({ ...p, name: e.target.value }))
                                }
                              />
                            </div>
                            <div>
                              <Label htmlFor="add-phone">Phone *</Label>
                              <Input
                                id="add-phone"
                                value={manualContact.phone}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setManualContact((p) => ({ ...p, phone: e.target.value }))
                                }
                                placeholder="e.g., +256778825312"
                              />
                              {manualContact.phone && !phoneValidation.valid && (
                                <div className="text-xs text-red-600 mt-1">Invalid phone. Use E.164 format, e.g., +256778825312</div>
                              )}
                            </div>
                            <div>
                              <Label htmlFor="add-email">Email (optional)</Label>
                              <Input
                                id="add-email"
                                type="email"
                                value={manualContact.email}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  setManualContact((p) => ({ ...p, email: e.target.value }))
                                }
                              />
                            </div>
                            <div>
                              <Label htmlFor="add-notes">Notes (optional)</Label>
                              <Textarea
                                id="add-notes"
                                rows={3}
                                value={manualContact.notes}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                                  setManualContact((p) => ({ ...p, notes: e.target.value }))
                                }
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" onClick={() => setIsAddContactOpen(false)}>Cancel</Button>
                              <Button onClick={handleAddContact} className="bg-teal-500 hover:bg-teal-600" disabled={!phoneValidation.valid}>Add</Button>
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
                            <span className="font-medium text-black">{contact.name || contact.phone || "Unknown"}</span>
                            {!isValidPhone(contact.phone || "") && (
                              <Badge className="bg-red-100 text-red-800 border border-red-300">Invalid Phone</Badge>
                            )}
                          </div>
                          <div className="text-sm text-gray-600">
                            {(contact.phone || "No phone")} • {(contact.email || "No email")} • {(contact.notes || "No notes")}
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.stopPropagation()
                              const newName = prompt("Enter new batch name:", batch.name)
                              if (newName && newName.trim()) handleRenameBatch(batch.id, newName.trim())
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.stopPropagation()
                              handleDeleteBatch(batch.id)
                            }}
                          >
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
                            // Estimate time if we have concurrent calls: assume one call initiated per second per line
                            const m = (campaign.description || '').match(/Concurrent\s*Calls\s*:\s*(\d+)/i)
                            const lines = m ? Math.max(1, Number((m[1] || '').trim()) || 1) : 1
                            const contacts = Math.max(0, campaign.target_contacts ?? 0)
                            const totalSeconds = lines > 0 ? Math.ceil(contacts / lines) : contacts
                            const hh = Math.floor(totalSeconds / 3600)
                            const mm = Math.floor((totalSeconds % 3600) / 60)
                            const ss = Math.floor(totalSeconds % 60)
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
