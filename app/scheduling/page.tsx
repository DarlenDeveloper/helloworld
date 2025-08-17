"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, Plus, CalendarIcon, Edit, Trash2, Users, FolderOpen, Clock } from "lucide-react"
import { format } from "date-fns"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"

interface Contact {
  id: string
  name: string
  phone: string
  email: string
  company: string
  status: "new" | "called" | "follow-up" | "not-interested"
  lastCalled?: Date
}

interface ContactBatch {
  id: string
  name: string
  contacts: Contact[]
  createdAt: Date
}

interface KnowledgePrompt {
  id: string
  name: string
  content: string
  documents: string[]
}

interface Campaign {
  id: string
  name: string
  contactCount: number
  scheduledDate: Date
  timeframe: { start: string; end: string }
  concurrentCalls: number
  status: "scheduled" | "running" | "completed" | "incomplete"
  prompt: string
  selectedBatches: string[]
}

function getStatusColor(status: string) {
  switch (status) {
    case "new":
      return "bg-blue-100 text-blue-800"
    case "called":
      return "bg-green-100 text-green-800"
    case "follow-up":
      return "bg-yellow-100 text-yellow-800"
    case "not-interested":
      return "bg-red-100 text-red-800"
    default:
      return "bg-gray-100 text-gray-800"
  }
}

export default function SchedulingPage() {
  const [contactBatches, setContactBatches] = useState<ContactBatch[]>([
    {
      id: "1",
      name: "Q1 Prospects",
      createdAt: new Date(),
      contacts: [
        {
          id: "1",
          name: "John Smith",
          phone: "+1-555-0123",
          email: "john@company.com",
          company: "Tech Corp",
          status: "new",
        },
        {
          id: "2",
          name: "Sarah Johnson",
          phone: "+1-555-0124",
          email: "sarah@startup.com",
          company: "StartupXYZ",
          status: "called",
          lastCalled: new Date(),
        },
      ],
    },
    {
      id: "2",
      name: "Enterprise Leads",
      createdAt: new Date(),
      contacts: [
        {
          id: "3",
          name: "Mike Wilson",
          phone: "+1-555-0125",
          email: "mike@business.com",
          company: "Business Inc",
          status: "follow-up",
        },
      ],
    },
  ])

  const [campaigns, setCampaigns] = useState<Campaign[]>([
    {
      id: "1",
      name: "Q1 Product Launch",
      contactCount: 250,
      scheduledDate: new Date(),
      timeframe: { start: "09:00", end: "17:00" },
      concurrentCalls: 5,
      status: "scheduled",
      prompt: "Hello, I'm calling about our new product launch...",
      selectedBatches: ["1"],
    },
    {
      id: "2",
      name: "Enterprise Outreach",
      contactCount: 150,
      scheduledDate: new Date(Date.now() - 86400000),
      timeframe: { start: "09:00", end: "17:00" },
      concurrentCalls: 3,
      status: "incomplete",
      prompt: "Hello, I'm reaching out regarding enterprise solutions...",
      selectedBatches: ["2"],
    },
  ])

  const [selectedBatch, setSelectedBatch] = useState<string | null>(null)
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

  const handleCreateBatch = () => {
    const newBatch: ContactBatch = {
      id: Date.now().toString(),
      name: `New Batch ${contactBatches.length + 1}`,
      contacts: [],
      createdAt: new Date(),
    }
    setContactBatches((prev) => [...prev, newBatch])
  }

  const handleDeleteBatch = (batchId: string) => {
    setContactBatches((prev) => prev.filter((batch) => batch.id !== batchId))
  }

  const handleRenameBatch = (batchId: string, newName: string) => {
    setContactBatches((prev) => prev.map((batch) => (batch.id === batchId ? { ...batch, name: newName } : batch)))
  }

  const getCampaignStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-blue-100 text-blue-800"
      case "running":
        return "bg-green-100 text-green-800"
      case "completed":
        return "bg-gray-100 text-gray-800"
      case "incomplete":
        return "bg-yellow-100 text-yellow-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const handleCreateCampaign = async () => {
    console.log("[v0] Creating campaign with data:", campaignForm)

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
      // Calculate total contacts from selected batches
      const totalContacts = contactBatches
        .filter((batch) => campaignForm.selectedBatches.includes(batch.id))
        .reduce((sum, batch) => sum + batch.contacts.length, 0)

      const newCampaign: Campaign = {
        id: Date.now().toString(),
        name: campaignForm.name,
        contactCount: totalContacts,
        scheduledDate: new Date(campaignForm.scheduledDate),
        timeframe: {
          start: campaignForm.startTime,
          end: campaignForm.endTime,
        },
        concurrentCalls: campaignForm.concurrentCalls,
        status: "scheduled",
        prompt: campaignForm.prompt,
        selectedBatches: campaignForm.selectedBatches,
      }

      console.log("[v0] New campaign created:", newCampaign)

      // Add to campaigns list
      setCampaigns((prev) => [...prev, newCampaign])

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

      // TODO: In a real app, this would make an API call to persist the campaign
      // await fetch('/api/campaigns', { method: 'POST', body: JSON.stringify(newCampaign) })
    } catch (error) {
      console.error("[v0] Error creating campaign:", error)
      alert("Failed to create campaign. Please try again.")
    } finally {
      setIsCreatingCampaign(false)
    }
  }

  const handleBatchSelection = (batchId: string, checked: boolean) => {
    setCampaignForm((prev) => ({
      ...prev,
      selectedBatches: checked
        ? [...prev.selectedBatches, batchId]
        : prev.selectedBatches.filter((id) => id !== batchId),
    }))
  }

  return (
    <div className="ml-64 min-h-screen bg-gray-50">
      <div className="p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-black">Call Scheduling</h1>
              <p className="text-gray-600 mt-2">Manage contact batches and create outbound call campaigns</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="border-gray-300 bg-white hover:bg-gray-50"
                onClick={handleCreateBatch}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Batch
              </Button>
              <Button variant="outline" className="border-gray-300 bg-white hover:bg-gray-50">
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
                      <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-3">
                        {contactBatches.map((batch) => (
                          <div key={batch.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`batch-${batch.id}`}
                              checked={campaignForm.selectedBatches.includes(batch.id)}
                              onCheckedChange={(checked) => handleBatchSelection(batch.id, checked as boolean)}
                            />
                            <Label htmlFor={`batch-${batch.id}`} className="flex-1 cursor-pointer">
                              {batch.name} ({batch.contacts.length} contacts)
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
                      <Button
                        onClick={handleCreateCampaign}
                        disabled={isCreatingCampaign}
                        className="bg-teal-500 hover:bg-teal-600"
                      >
                        {isCreatingCampaign ? "Creating..." : "Create Campaign"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 lg:gap-8">
            {/* Contact Batches Section - Takes up more space in grid view */}
            <div className="xl:col-span-3">
              {selectedBatch ? (
                <Card className="shadow-sm border-gray-200">
                  <CardHeader className="bg-white border-b border-gray-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedBatch(null)}
                          className="hover:bg-gray-100"
                        >
                          ← Back
                        </Button>
                        <CardTitle className="text-black">
                          {contactBatches.find((b) => b.id === selectedBatch)?.name}
                        </CardTitle>
                      </div>
                      <Button variant="outline" size="sm" className="bg-white hover:bg-gray-50">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Contact
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid gap-4">
                      {contactBatches
                        .find((b) => b.id === selectedBatch)
                        ?.contacts.map((contact) => (
                          <div
                            key={contact.id}
                            className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className="font-medium text-black truncate">{contact.name}</span>
                                <Badge className={getStatusColor(contact.status)}>{contact.status}</Badge>
                              </div>
                              <div className="text-sm text-gray-600 space-y-1">
                                <div>{contact.phone}</div>
                                <div className="truncate">{contact.email}</div>
                                <div className="text-gray-500">{contact.company}</div>
                              </div>
                            </div>
                            <div className="flex gap-2 sm:flex-col lg:flex-row">
                              <Button variant="ghost" size="sm" className="hover:bg-gray-100">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="shadow-sm border-gray-200">
                  <CardHeader className="bg-white border-b border-gray-100">
                    <CardTitle className="text-black">Contact Batches</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {contactBatches.map((batch) => (
                        <div
                          key={batch.id}
                          className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 cursor-pointer transition-colors group"
                          onClick={() => setSelectedBatch(batch.id)}
                        >
                          <div className="flex-shrink-0 mt-1">
                            <FolderOpen className="h-5 w-5 text-teal-600 group-hover:text-teal-700" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-black mb-1 truncate">{batch.name}</div>
                            <div className="text-sm text-gray-600 space-y-1">
                              <div className="flex items-center gap-2">
                                <Users className="h-3 w-3" />
                                <span>{batch.contacts.length} contacts</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <CalendarIcon className="h-3 w-3" />
                                <span>Created {format(batch.createdAt, "MMM d, yyyy")}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 hover:bg-gray-200"
                              onClick={(e) => {
                                e.stopPropagation()
                                const newName = prompt("Enter new batch name:", batch.name)
                                if (newName) handleRenameBatch(batch.id, newName)
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (confirm("Delete this batch?")) handleDeleteBatch(batch.id)
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

            {/* Campaign List Sidebar */}
            <div className="xl:col-span-1">
              <Card className="shadow-sm border-gray-200 sticky top-6">
                <CardHeader className="bg-white border-b border-gray-100">
                  <CardTitle className="text-black">Active Campaigns</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="space-y-4">
                    {campaigns.map((campaign) => (
                      <div
                        key={campaign.id}
                        className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="font-medium text-black text-sm leading-tight pr-2">{campaign.name}</h3>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-gray-100">
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2 text-xs text-gray-600">
                          <div className="flex items-center gap-2">
                            <Users className="h-3 w-3 flex-shrink-0" />
                            <span>{campaign.contactCount} contacts</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="h-3 w-3 flex-shrink-0" />
                            <span>{format(campaign.scheduledDate, "MMM d, yyyy")}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3 flex-shrink-0" />
                            <span>
                              {campaign.timeframe.start} - {campaign.timeframe.end}
                            </span>
                          </div>
                          <div className="pt-1">
                            <Badge className={getCampaignStatusColor(campaign.status)} variant="secondary">
                              {campaign.status}
                            </Badge>
                          </div>
                          {campaign.status === "incomplete" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-3 text-xs border-yellow-500 text-yellow-600 bg-transparent hover:bg-yellow-50"
                            >
                              Reschedule Remaining
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
    </div>
  )
}
