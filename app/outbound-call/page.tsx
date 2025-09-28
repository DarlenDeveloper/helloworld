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

interface CallReason {
  id: string
  name: string
  template: string
  variables: string[]
}

const CALL_REASONS: CallReason[] = [
  {
    id: "package_pickup",
    name: "Package Pickup Notification",
    template: "to inform you that your package has arrived at our office. You can pick it up during our business hours from 9 AM to 6 PM. Please bring a valid ID for verification.",
    variables: []
  },
  {
    id: "appointment_reminder",
    name: "Appointment Reminder",
    template: "to remind you about your upcoming appointment scheduled for {{appointmentDate}} at {{appointmentTime}}. Please let me know if you need to reschedule.",
    variables: ["appointmentDate", "appointmentTime"]
  },
  {
    id: "payment_reminder",
    name: "Payment Reminder",
    template: "to remind you about your outstanding invoice #{{invoiceNumber}} of ${{amount}} that was due on {{dueDate}}. We'd appreciate your prompt payment.",
    variables: ["invoiceNumber", "amount", "dueDate"]
  },
  {
    id: "service_follow_up",
    name: "Service Follow-up",
    template: "to follow up on the {{serviceType}} service we provided on {{serviceDate}}. We'd love to hear your feedback and ensure everything met your expectations.",
    variables: ["serviceType", "serviceDate"]
  },
  {
    id: "custom",
    name: "Custom Message",
    template: "{{customMessage}}",
    variables: ["customMessage"]
  }
]

export default function OutboundCallPage() {
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [selectedReason, setSelectedReason] = useState<CallReason | null>(null)
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [isCreatingCall, setIsCreatingCall] = useState(false)
  const [callResult, setCallResult] = useState<any>(null)
  const [showPreview, setShowPreview] = useState(false)

  const generateScript = () => {
    if (!selectedReason || !customerName) return ""
    
    let script = `Hi, this is Brian from Skynet. Am I speaking to ${customerName}?

Great! The reason for my call is ${selectedReason.template}`

    // Replace variables in the script
    selectedReason.variables.forEach(variable => {
      const value = variables[variable] || `[${variable}]`
      script = script.replace(`{{${variable}}}`, value)
    })

    return script
  }

  const handleReasonChange = (reasonId: string) => {
    const reason = CALL_REASONS.find(r => r.id === reasonId)
    setSelectedReason(reason || null)
    setVariables({}) // Reset variables when reason changes
  }

  const handleVariableChange = (variable: string, value: string) => {
    setVariables(prev => ({ ...prev, [variable]: value }))
  }

  const createCall = async () => {
    if (!customerName || !customerPhone || !selectedReason) return

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
          reason: selectedReason.name
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

  const isFormValid = customerName && customerPhone && selectedReason && 
    selectedReason.variables.every(variable => variables[variable])

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

            {/* Call Reason */}
            <div className="space-y-2">
              <Label>Call Reason</Label>
              <Select onValueChange={handleReasonChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select call reason" />
                </SelectTrigger>
                <SelectContent>
                  {CALL_REASONS.map((reason) => (
                    <SelectItem key={reason.id} value={reason.id}>
                      {reason.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic Variables */}
            {selectedReason && selectedReason.variables.length > 0 && (
              <div className="space-y-3">
                <Label>Additional Information</Label>
                {selectedReason.variables.map((variable) => (
                  <div key={variable} className="space-y-1">
                    <Label className="text-sm text-gray-600 capitalize">
                      {variable.replace(/([A-Z])/g, ' $1').trim()}
                    </Label>
                    <Input
                      placeholder={`Enter ${variable}`}
                      value={variables[variable] || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleVariableChange(variable, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4">
              <Button
                onClick={() => setShowPreview(!showPreview)}
                variant="outline"
                disabled={!customerName || !selectedReason}
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
                    {generateScript() || "Fill in the form to see the generated script"}
                  </p>
                </div>
                {selectedReason && (
                  <div className="mt-3">
                    <Badge variant="secondary">{selectedReason.name}</Badge>
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

          {/* Quick Tips */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Tips</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600 space-y-2">
              <p>• Use the customer's full name for better personalization</p>
              <p>• Include country code in phone numbers (+1 for US)</p>
              <p>• Preview the script before making the call</p>
              <p>• Custom messages allow complete flexibility</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
