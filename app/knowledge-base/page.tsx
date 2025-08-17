"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Lock, Eye, Copy, Edit, Trash2, Plus, X, FileText, Upload } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"

interface SupportDocument {
  id: string
  name: string
  type: string
  size: string
}

interface Agent {
  id: string
  name: string
  openingStatement: string
  prompt: string
  supportDocuments: SupportDocument[]
  isMaster?: boolean
}

export default function KnowledgeBasePage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [showAgentModal, setShowAgentModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [showEditPromptModal, setShowEditPromptModal] = useState(false)
  const [showDocumentSelector, setShowDocumentSelector] = useState(false)

  // Sample data
  const [masterAgents, setMasterAgents] = useState<Agent[]>([
    {
      id: "master-1",
      name: "Customer Support Agent",
      openingStatement: "Hello! Thank you for calling. How can I assist you today?",
      prompt:
        "You are a professional customer support agent. Be helpful, empathetic, and solution-oriented. Always maintain a friendly tone and ask clarifying questions when needed.",
      supportDocuments: [
        { id: "doc-1", name: "FAQ_Guide.pdf", type: "PDF", size: "2.3 MB" },
        { id: "doc-2", name: "Product_Manual.docx", type: "DOCX", size: "1.8 MB" },
      ],
      isMaster: true,
    },
    {
      id: "master-2",
      name: "Technical Support Agent",
      openingStatement: "Hi there! I'm here to help with any technical issues you're experiencing.",
      prompt:
        "You are a technical support specialist. Provide clear, step-by-step solutions. Ask about system details when troubleshooting and escalate complex issues appropriately.",
      supportDocuments: [{ id: "doc-3", name: "Technical_Troubleshooting.pdf", type: "PDF", size: "3.1 MB" }],
      isMaster: true,
    },
  ])

  const [customAgents, setCustomAgents] = useState<Agent[]>([
    {
      id: "custom-1",
      name: "Sales Inquiry Agent",
      openingStatement: "Good day! I'm excited to help you learn more about our services.",
      prompt:
        "You are a sales-focused agent. Be enthusiastic but not pushy. Focus on understanding customer needs and matching them with appropriate solutions.",
      supportDocuments: [],
    },
  ])

  const [supportDocuments] = useState<SupportDocument[]>([
    { id: "doc-1", name: "FAQ_Guide.pdf", type: "PDF", size: "2.3 MB" },
    { id: "doc-2", name: "Product_Manual.docx", type: "DOCX", size: "1.8 MB" },
    { id: "doc-3", name: "Technical_Troubleshooting.pdf", type: "PDF", size: "3.1 MB" },
    { id: "doc-4", name: "Company_Policies.pdf", type: "PDF", size: "1.2 MB" },
    { id: "doc-5", name: "Pricing_Sheet.xlsx", type: "XLSX", size: "0.8 MB" },
  ])

  const [newAgent, setNewAgent] = useState({
    name: "",
    openingStatement: "",
    prompt: "",
    supportDocuments: [] as SupportDocument[],
  })

  const handlePasswordSubmit = () => {
    if (password === "123") {
      setIsAuthenticated(true)
      setPasswordError("")
    } else {
      setPasswordError("Incorrect password")
    }
  }

  const handleViewAgent = (agent: Agent) => {
    setSelectedAgent(agent)
    setShowViewModal(true)
  }

  const handleCopyAgent = (agent: Agent) => {
    setNewAgent({
      name: `${agent.name} (Copy)`,
      openingStatement: agent.openingStatement,
      prompt: agent.prompt,
      supportDocuments: [...agent.supportDocuments],
    })
    setShowAgentModal(true)
  }

  const handleEditAgent = (agent: Agent) => {
    setEditingAgent(agent)
    setNewAgent({
      name: agent.name,
      openingStatement: agent.openingStatement,
      prompt: agent.prompt,
      supportDocuments: [...agent.supportDocuments],
    })
    setShowAgentModal(true)
  }

  const handleSaveAgent = () => {
    if (editingAgent) {
      if (editingAgent.isMaster) {
        // For master agents, only update name, opening statement, and documents
        const updatedMasters = masterAgents.map((agent) =>
          agent.id === editingAgent.id
            ? {
                ...agent,
                name: newAgent.name,
                openingStatement: newAgent.openingStatement,
                supportDocuments: newAgent.supportDocuments,
              }
            : agent,
        )
        setMasterAgents(updatedMasters)
      } else {
        setCustomAgents((prev) =>
          prev.map((agent) => (agent.id === editingAgent.id ? { ...agent, ...newAgent } : agent)),
        )
      }
    } else {
      const newCustomAgent: Agent = {
        id: `custom-${Date.now()}`,
        ...newAgent,
      }
      setCustomAgents((prev) => [...prev, newCustomAgent])
    }

    setShowAgentModal(false)
    setEditingAgent(null)
    setNewAgent({ name: "", openingStatement: "", prompt: "", supportDocuments: [] })
  }

  const handleDeleteAgent = (agentId: string) => {
    setCustomAgents((prev) => prev.filter((agent) => agent.id !== agentId))
  }

  const handleAddDocument = (document: SupportDocument) => {
    setNewAgent((prev) => ({
      ...prev,
      supportDocuments: [...prev.supportDocuments, document],
    }))
  }

  const handleRemoveDocument = (documentId: string) => {
    setNewAgent((prev) => ({
      ...prev,
      supportDocuments: prev.supportDocuments.filter((doc) => doc.id !== documentId),
    }))
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <Card className="w-96">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mb-4">
              <Lock className="h-8 w-8 text-teal-600" />
            </div>
            <CardTitle className="text-2xl text-black">Knowledge Base Access</CardTitle>
            <p className="text-gray-600">
              This section contains sensitive information. Please enter the access password.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handlePasswordSubmit()}
                className="border-gray-300"
              />
              {passwordError && <p className="text-red-500 text-sm mt-1">{passwordError}</p>}
            </div>
            <Button onClick={handlePasswordSubmit} className="w-full bg-teal-600 hover:bg-teal-700 text-white">
              Access Knowledge Base
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-black mb-2">Knowledge Base</h1>
          <p className="text-gray-600">Manage AI agents and support documentation</p>
        </div>

        <Tabs defaultValue="inbound" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-gray-100">
            <TabsTrigger value="inbound" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
              Inbound Agents
            </TabsTrigger>
            <TabsTrigger value="outbound" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
              Outbound Agents
            </TabsTrigger>
            <TabsTrigger value="documents" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
              Support Documents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inbound" className="space-y-6">
            {/* Master Agents Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-black">Master Agents</h2>
                <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                  Pre-configured
                </Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {masterAgents.map((agent) => (
                  <Card key={agent.id} className="border-gray-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg text-black">{agent.name}</CardTitle>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewAgent(agent)}
                            className="h-8 w-8 p-0 text-gray-600 hover:text-teal-600"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCopyAgent(agent)}
                            className="h-8 w-8 p-0 text-gray-600 hover:text-teal-600"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditAgent(agent)}
                            className="h-8 w-8 p-0 text-gray-600 hover:text-teal-600"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 mb-3">{agent.openingStatement}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <FileText className="h-3 w-3" />
                        {agent.supportDocuments.length} documents attached
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Custom Agents Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-black">Custom Agents</h2>
                <Button onClick={() => setShowAgentModal(true)} className="bg-teal-600 hover:bg-teal-700 text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Agent
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {customAgents.map((agent) => (
                  <Card key={agent.id} className="border-gray-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg text-black">{agent.name}</CardTitle>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewAgent(agent)}
                            className="h-8 w-8 p-0 text-gray-600 hover:text-teal-600"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditAgent(agent)}
                            className="h-8 w-8 p-0 text-gray-600 hover:text-teal-600"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteAgent(agent.id)}
                            className="h-8 w-8 p-0 text-gray-600 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 mb-3">{agent.openingStatement}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <FileText className="h-3 w-3" />
                        {agent.supportDocuments.length} documents attached
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="outbound" className="space-y-6">
            <div className="text-center py-12">
              <p className="text-gray-500">Outbound agents section coming soon...</p>
            </div>
          </TabsContent>

          <TabsContent value="documents" className="space-y-6">
            <div className="text-center py-12">
              <p className="text-gray-500">Support documents section coming soon...</p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Agent Creation/Edit Modal */}
        <Dialog open={showAgentModal} onOpenChange={setShowAgentModal}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-black">{editingAgent ? "Edit Agent" : "Create New Agent"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-black mb-2 block">Agent Name</label>
                <Input
                  value={newAgent.name}
                  onChange={(e) => setNewAgent((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter agent name"
                  className="border-gray-300"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-black mb-2 block">Opening Statement</label>
                <Input
                  value={newAgent.openingStatement}
                  onChange={(e) => setNewAgent((prev) => ({ ...prev, openingStatement: e.target.value }))}
                  placeholder="How the agent greets customers"
                  className="border-gray-300"
                />
              </div>

              {!editingAgent?.isMaster && (
                <div>
                  <label className="text-sm font-medium text-black mb-2 block">Agent Prompt</label>
                  <Textarea
                    value={newAgent.prompt}
                    onChange={(e) => setNewAgent((prev) => ({ ...prev, prompt: e.target.value }))}
                    placeholder="Detailed instructions for the AI agent..."
                    rows={6}
                    className="border-gray-300"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-black">Support Documents</label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowDocumentSelector(true)}
                      className="text-teal-600 border-teal-600 hover:bg-teal-50"
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      From Library
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-teal-600 border-teal-600 hover:bg-teal-50 bg-transparent"
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      Upload New
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {newAgent.supportDocuments.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-black">{doc.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {doc.type}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveDocument(doc.id)}
                        className="h-6 w-6 p-0 text-gray-500 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAgentModal(false)
                    setEditingAgent(null)
                    setNewAgent({ name: "", openingStatement: "", prompt: "", supportDocuments: [] })
                  }}
                  className="border-gray-300 text-gray-700"
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveAgent} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {editingAgent ? "Update Agent" : "Create Agent"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* View Agent Modal */}
        <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-black">{selectedAgent?.name}</DialogTitle>
            </DialogHeader>
            {selectedAgent && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-black mb-2 block">Opening Statement</label>
                  <p className="text-gray-700 p-3 bg-gray-50 rounded">{selectedAgent.openingStatement}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-black mb-2 block">Agent Prompt</label>
                  <p className="text-gray-700 p-3 bg-gray-50 rounded whitespace-pre-wrap">{selectedAgent.prompt}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-black mb-2 block">Support Documents</label>
                  <div className="space-y-2">
                    {selectedAgent.supportDocuments.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                        <FileText className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-black">{doc.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {doc.type}
                        </Badge>
                        <span className="text-xs text-gray-500 ml-auto">{doc.size}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Document Selector Modal */}
        <Dialog open={showDocumentSelector} onOpenChange={setShowDocumentSelector}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-black">Select Support Documents</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {supportDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 border rounded hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    handleAddDocument(doc)
                    setShowDocumentSelector(false)
                  }}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-black">{doc.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {doc.type}
                    </Badge>
                  </div>
                  <span className="text-xs text-gray-500">{doc.size}</span>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
