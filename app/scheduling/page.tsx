"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, Plus, Calendar as CalendarIcon, Edit, Trash2, Users, FolderOpen, Clock } from "lucide-react"
import { format } from "date-fns"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

// DB types (subset)
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
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  company: string | null
  status: "active" | "inactive" | "blocked"
}

interface DbCampaign {
  id: string
  user_id: string
  name: string
  description: string | null
  status: "draft" | "active" | "paused" | "completed" | "cancelled"
  start_date: string | null
  end_date: string | null
  contact_count: number
  calls_made: number
  success_rate: number
  created_at: string
  updated_at: string
}

function getContactBadgeColor(status: string) {
  switch (status) {
    case "active":
      return "bg-blue-100 text-blue-800"
    case "inactive":
      return "bg-gray-100 text-gray-800"
    case "blocked":
      return "bg-red-100 text-red-800"
    default:
      return "bg-gray-100 text-gray-800"
  }
}

function getCampaignStatusColor(status: string) {
  switch (status) {
    case "draft":
      return "bg-blue-100 text-blue-800"
    case "active":
      return "bg-green-100 text-green-800"
    case "completed":
      return "bg-gray-100 text-gray-800"
    case "paused":
      return "bg-yellow-100 text-yellow-800"
    case "cancelled":
      return "bg-red-100 text-red-800"
    default:
      return "bg-gray-100 text-gray-800"
  }
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
    scheduledDate: "",
    startTime: "09:00",
    endTime: "17:00",
    concurrentCalls: 3,
    prompt: "",
    selectedBatches: [] as string[],
  })

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
          // rely on middleware to redirect, but just in case
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
    if (!user) return

    // First fetch the contact IDs from the junction table
    const { data: linkRows, error: linkErr } = await supabase
      .from("batch_contacts")
      .select("contact_id")
      .eq("batch_id", batchId)

    if (linkErr) {
      console.error("Error fetching batch_contacts:", linkErr)
      setSelectedBatchContacts([])
      return
    }

    const ids = (linkRows || []).map((r) => r.contact_id)
    if (ids.length === 0) {
      setSelectedBatchContacts([])
      return
    }

    const { data: contacts, error: contactsErr } = await supabase
      .from("contacts")
      .select("id, user_id, first_name, last_name, email, phone, company, status")
      .in("id", ids)
      .eq("user_id", user.id)

    if (contactsErr) {
      console.error("Error fetching contacts:", contactsErr)
      setSelectedBatchContacts([])
      return
    }

    setSelectedBatchContacts(contacts || [])
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
    setCampaigns(data || [])
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

    // Validation
    if (!campaignForm.name.trim()) {
      alert("Campaign name is required")
      return
    }

    if (!campaignForm.scheduledDate) {
      alert("Scheduled date is required")
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
      // Compute contact_count by summing selected batches' contact_count
      const totalContacts = campaignForm.selectedBatches.reduce((sum, id) => sum + (batchMap.get(id)?.contact_count || 0), 0)

      // Build start/end dates
      const dateOnly = campaignForm.scheduledDate // yyyy-MM-dd
      const start = new Date(`${dateOnly}T${campaignForm.startTime}:00`)
      const end = new Date(`${dateOnly}T${campaignForm.endTime}:00`)

      // Store prompt and concurrentCalls in description for now
      const description = `Prompt: ${campaignForm.prompt}\nConcurrent Calls: ${campaignForm.concurrentCalls}`

      const { data: newCampaign, error } = await supabase
        .from("campaigns")
        .insert({
          user_id: user.id,
          name: campaignForm.name.trim(),
          description,
          status: "draft",
          start_date: start.toISOString(),
          end_date: end.toISOString(),
          contact_count: totalContacts,
        })
        .select("*")
        .single()

      if (error || !newCampaign) {
        console.error("Failed to create campaign:", error)
        alert("Failed to create campaign")
        return
      }

      // Link batches to the campaign
      if (campaignForm.selectedBatches.length > 0) {
        const rows = campaignForm.selectedBatches.map((batchId) => ({ campaign_id: newCampaign.id, batch_id: batchId }))
        const { error: linkErr } = await supabase.from("campaign_batches").insert(rows)
        if (linkErr) {
          console.error("Failed to link campaign batches:", linkErr)
          // Not fatal; continue
        }
      }

      // Update UI
      setCampaigns((prev) => [newCampaign as DbCampaign, ...prev])

      // Reset form and close dialog
      setCampaignForm({
        name: "",
        scheduledDate: "",
        startTime: "09:00",
        endTime: "17:00",
        concurrentCalls: 3,
        prompt: "",
        selectedBatches: [],
      })
      setIsCreateCampaignOpen(false)
    } catch (err) {
      console.error("Error creating campaign:", err)
      alert("Failed to create campaign. Please try again.")
    } finally {
      setIsCreatingCampaign(false)
    }
  }

  useEffect(() => {
    if (selectedBatch) {
      fetchBatchContacts(selectedBatch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatch])

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
            <Button variant="outline" className="border-gray-300 bg-transparent" disabled>
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
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
                  <DialogTitle>Create New Campaign</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                  {/* Campaign Name */}
                  <div className="space-y-2">
                    <Label htmlFor="campaign-name">Campaign Name *</Label>
                    <Input
                      id="campaign-name"
                      placeholder="Enter campaign name"
                      value={campaignForm.name}
                      onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))}
                    />
                  </div>

                  {/* Scheduling */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="scheduled-date">Scheduled Date *</Label>
                      <Input
                        id="scheduled-date"
                        type="date"
                        value={campaignForm.scheduledDate}
                        onChange={(e) => setCampaignForm((prev) => ({ ...prev, scheduledDate: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="start-time">Start Time</Label>
                      <Input
                        id="start-time"
                        type="time"
                        value={campaignForm.startTime}
                        onChange={(e) => setCampaignForm((prev) => ({ ...prev, startTime: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="end-time">End Time</Label>
                      <Input
                        id="end-time"
                        type="time"
                        value={campaignForm.endTime}
                        onChange={(e) => setCampaignForm((prev) => ({ ...prev, endTime: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Concurrent Calls */}
                  <div className="space-y-2">
                    <Label htmlFor="concurrent-calls">Concurrent Calls</Label>
                    <Select
                      value={campaignForm.concurrentCalls.toString()}
                      onValueChange={(value) =>
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
                            onCheckedChange={(checked) => handleBatchSelection(batch.id, checked as boolean)}
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
                      onChange={(e) => setCampaignForm((prev) => ({ ...prev, prompt: e.target.value }))}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateCampaignOpen(false)}
                      disabled={isCreatingCampaign}
                    >
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
                      <CardTitle className="text-black">
                        {batchMap.get(selectedBatch)?.name || "Contacts"}
                      </CardTitle>
                    </div>
                    <Button variant="outline" size="sm" disabled>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Contact
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {selectedBatchContacts.length === 0 && (
                      <div className="text-sm text-gray-500">No contacts in this batch yet.</div>
                    )}
                    {selectedBatchContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center gap-4 p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-black">
                              {contact.first_name} {contact.last_name}
                            </span>
                            <Badge className={getContactBadgeColor(contact.status)}>{contact.status}</Badge>
                          </div>
                          <div className="text-sm text-gray-600">
                            {contact.phone || "No phone"} • {contact.email || "No email"} • {contact.company || "No company"}
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
                      <div
                        key={batch.id}
                        className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                        onClick={() => {
                          setSelectedBatch(batch.id)
                        }}
                      >
                        <FolderOpen className="h-5 w-5 text-teal-600" />
                        <div className="flex-1">
                          <div className="font-medium text-black">{batch.name}</div>
                          <div className="text-sm text-gray-600">
                            {batch.contact_count} contacts • Created {format(new Date(batch.created_at), "MMM d, yyyy")}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
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
                            onClick={(e) => {
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
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-700" disabled>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          {campaign.contact_count} contacts
                        </div>
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4" />
                          {campaign.start_date ? format(new Date(campaign.start_date), "MMM d, yyyy") : "N/A"}
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {campaign.start_date && campaign.end_date
                            ? `${format(new Date(campaign.start_date), "HH:mm")} - ${format(
                                new Date(campaign.end_date),
                                "HH:mm",
                              )}`
                            : "N/A"}
                        </div>
                        <Badge className={getCampaignStatusColor(campaign.status)}>{campaign.status}</Badge>
                        {campaign.status === "paused" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full mt-2 border-yellow-500 text-yellow-600 bg-transparent"
                            disabled
                          >
                            Resume Campaign
                          </Button>
                        )}
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
