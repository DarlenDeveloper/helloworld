"use client"

import { useState } from "react"
import type React from "react"
import { Phone, Users, MessageCircle, Play, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"

// Quick templates for common scenarios (optional)
const QUICK_TEMPLATES = [
  {
    id: "package_pickup",
    name: "Package Pickup",
    message: "Great! The reason for my call is to inform you that your package has arrived at our office. You can pick it up during our business hours from 9 AM to 6 PM. Please bring a valid ID for verification."
  },
  {
    id: "appointment_reminder", 
    name: "Appointment Reminder",
    message: "Perfect! I'm calling to remind you about your upcoming appointment scheduled for {{appointmentDate}} at {{appointmentTime}}. Please let me know if you need to reschedule or if you have any questions."
  },
  {
    id: "payment_reminder",
    name: "Payment Reminder", 
    message: "Thank you for confirming. I'm calling regarding your outstanding invoice #{{invoiceNumber}} of ${{amount}} that was due on {{dueDate}}. We'd appreciate your prompt payment. Would you like me to help you with payment options?"
  },
  {
    id: "service_followup",
    name: "Service Follow-up",
    message: "Excellent! I'm calling to follow up on the {{serviceType}} service we provided on {{serviceDate}}. We'd love to hear your feedback and ensure everything met your expectations. How was your experience?"
  }
]

export default function OutboundCallPage() {
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [openingMessage, setOpeningMessage] = useState("")
  const [callMessage, setCallMessage] = useState("")
  const [selectedTemplate, setSelectedTemplate] = useState("")
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [isCreatingCall, setIsCreatingCall] = useState(false)
  const [callResult, setCallResult] = useState<any>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Extract variables from text ({{variableName}})
  const extractVariables = (text: string): string[] => {
    const matches = text.match(/\{\{([^}]+)\}\}/g)
    return matches ? matches.map(match => match.slice(2, -2)) : []
  }

  const getAllVariables = (): string[] => {
    const openingVars = extractVariables(openingMessage)
    const messageVars = extractVariables(callMessage)
    return [...new Set([...openingVars, ...messageVars])]
  }

  const generateScript = () => {
    if (!callMessage) return ""
    
    let script = callMessage

    // Replace variables in the script
    getAllVariables().forEach(variable => {
      const value = variables[variable] || `[${variable}]`
      script = script.replace(new RegExp(`\\{\\{${variable}\\}\\}`, 'g'), value)
    })

    return script
  }

  const generateFullPreview = () => {
    const callerName = variables['callerName'] || 'Brian'
    const companyName = variables['companyName'] || 'Skynet'
    const customerNameVar = variables['customerName'] || customerName || '[Customer Name]'
    
    const opening = `Hi, this is ${callerName} from ${companyName}. Am I speaking to ${customerNameVar}?`
    const message = generateScript()
    
    if (!message) return opening
    
    return `${opening}\n\n[After customer confirms identity]\n\n${message}`
  }

  const handleTemplateChange = (templateId: string) => {
    if (templateId === "custom") {
      setOpeningMessage("")
      setCallMessage("")
      setSelectedTemplate(templateId)
      return
    }

    const template = QUICK_TEMPLATES.find(t => t.id === templateId)
    if (template) {
      setCallMessage(template.message)
      setSelectedTemplate(templateId)
      setVariables({}) // Reset variables when template changes
    }
  }

  const handleVariableChange = (variable: string, value: string) => {
    setVariables(prev => ({ ...prev, [variable]: value }))
  }

  const createCall = async () => {
    if (!customerName || !customerPhone || (!openingMessage && !callMessage)) return

    setIsCreatingCall(true)
    setCallResult(null)

    try {
      const script = generateScript()
      
      const response = await fetch('/api/vapi/create-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customerName,
          customerPhone,
          script,
          reason: selectedTemplate || "Custom Call"
        })
      })

      const result = await response.json()
      setCallResult(result)
    } catch (error) {
      console.error('Error creating call:', error)
      setCallResult({ success: false, error: 'Failed to create call' })
    } finally {
      setIsCreatingCall(false)
    }
  }

  const allVariables = getAllVariables()
  const isFormValid = customerName && customerPhone && callMessage && 
    allVariables.every(variable => variables[variable])

  return (
    <div className="ml-20 p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Create Outbound Call</h1>
        <p className="text-gray-600">Generate personalized AI scripts and make single outbound calls</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Call Setup Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Call Setup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Customer Information */}
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer Name</Label>
              <Input
                id="customerName"
                placeholder="Enter customer name"
                value={customerName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomerName(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customerPhone">Customer Phone</Label>
              <Input
                id="customerPhone"
                placeholder="+1234567890"
                value={customerPhone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomerPhone(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Template Selection */}
            <div className="space-y-2">
              <Label>Quick Templates (Optional)</Label>
              <Select onValueChange={handleTemplateChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template or create custom" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom Script</SelectItem>
                  {QUICK_TEMPLATES.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Call Message */}
            <div className="space-y-2">
              <Label htmlFor="callMessage">Your Message</Label>
              <Textarea
                id="callMessage"
                placeholder="The reason for my call is to inform you that your package has arrived..."
                value={callMessage}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCallMessage(e.target.value)}
                rows={5}
                className="w-full"
              />
              <p className="text-xs text-gray-500">
                This message will be delivered AFTER confirming customer identity. Use {"{"}{"{"} variableName {"}"}{"}"}  for dynamic content.
              </p>
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-900 mb-2">How This Works:</h4>
              <ol className="text-sm text-blue-800 space-y-1">
                <li><strong>1.</strong> AI starts: "Hi, this is Brian from Skynet. Am I speaking to {customerName || '[Customer]'}?"</li>
                <li><strong>2.</strong> Waits for customer to confirm their identity</li>
                <li><strong>3.</strong> Only then delivers your message above</li>
              </ol>
            </div>

            {/* Dynamic Variables */}
            {allVariables.length > 0 && (
              <div className="space-y-3">
                <Label>Variables Found</Label>
                <div className="grid grid-cols-1 gap-3">
                  {allVariables.map((variable) => (
                    <div key={variable} className="space-y-1">
                      <Label className="text-sm text-gray-600">
                        {variable}
                      </Label>
                      <Input
                        placeholder={`Enter ${variable}`}
                        value={variables[variable] || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleVariableChange(variable, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4">
              <Button
                onClick={() => setShowPreview(!showPreview)}
                variant="outline"
                disabled={!customerName || !callMessage}
                className="flex-1"
              >
                <Search className="h-4 w-4 mr-2" />
                {showPreview ? 'Hide Preview' : 'Preview Script'}
              </Button>
              
              <Button
                onClick={createCall}
                disabled={!isFormValid || isCreatingCall}
                className="flex-1"
              >
                {isCreatingCall ? (
                  <Phone className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {isCreatingCall ? 'Creating Call...' : 'Make Call'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Script Preview & Results */}
        <div className="space-y-6">
          {/* Script Preview */}
          {showPreview && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Script Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
                  <p className="text-sm text-blue-800 whitespace-pre-line">
                    {generateFullPreview() || "Fill in the form to see the generated script"}
                  </p>
                </div>
                {selectedTemplate && selectedTemplate !== "custom" && (
                  <div className="mt-3">
                    <Badge variant="secondary">
                      {QUICK_TEMPLATES.find(t => t.id === selectedTemplate)?.name || "Template"}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Call Result */}
          {callResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Call Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {callResult.success ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-100 text-green-800">Call Created</Badge>
                    </div>
                    <div className="text-sm text-gray-600">
                      <p><strong>Call ID:</strong> {callResult.data?.id}</p>
                      <p><strong>Status:</strong> {callResult.data?.status}</p>
                      <p><strong>Customer:</strong> {customerName}</p>
                      <p><strong>Phone:</strong> {customerPhone}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Badge className="bg-red-100 text-red-800">Call Failed</Badge>
                    <p className="text-sm text-red-600">{callResult.error}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Environment Setup */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Environment Setup</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600 space-y-2">
              <p><strong>Required:</strong></p>
              <p>• VAPI_API_KEY - Your Vapi API key</p>
              <p>• VAPI_PHONE_NUMBER_ID - Phone number ID</p>
              <p><strong>Optional:</strong></p>
              <p>• COMPANY_NAME (default: "Skynet")</p>
              <p>• CALLER_NAME (default: "Brian")</p>
              <p>• COMPANY_FILES_ID - Knowledge base file ID</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
