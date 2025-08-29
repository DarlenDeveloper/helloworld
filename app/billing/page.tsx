"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  CreditCard,
  Smartphone,
  Phone,
  Plus,
  Settings,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Edit,
  Calendar,
} from "lucide-react"

const packages = [
  { id: "starter", name: "Starter", price: 481000, agents: 2, minutes: 300 },
  { id: "popular", name: "Popular", price: 851000, agents: 5, minutes: 1000 },
  { id: "business", name: "Business", price: 1443000, agents: 10, minutes: 2000 },
  { id: "payg", name: "Pay as you go", price: 445500, agents: "Unlimited", minutes: 0, perMinute: 995 },
]

export default function BillingPage() {
  const [currentPackage, setCurrentPackage] = useState("payg")
  const [remainingMinutes, setRemainingMinutes] = useState(150)
  const [customMinutes, setCustomMinutes] = useState("")
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState("mtn")
  const [autoBilling, setAutoBilling] = useState(true)
  const [showPaymentGateway, setShowPaymentGateway] = useState(false)
  const [minutesToAdd, setMinutesToAdd] = useState(0)

  const [expandedSections, setExpandedSections] = useState({
    minutes: true,
    package: true,
    payment: true,
  })

  const [showPackageModal, setShowPackageModal] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState("")

  const [editingPayment, setEditingPayment] = useState(false)

  const currentPlan = packages.find((p) => p.id === currentPackage)
  const minutesProgress = currentPlan?.minutes ? (remainingMinutes / currentPlan.minutes) * 100 : 0

  const renewalDate = new Date()
  renewalDate.setMonth(renewalDate.getMonth() + 1)

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  const handleAddMinutes = (minutes: number) => {
    setMinutesToAdd(minutes)
    setShowPaymentGateway(true)
  }

  const handleCustomMinutes = () => {
    const minutes = Number.parseInt(customMinutes)
    if (minutes >= 10 && minutes <= 10000) {
      handleAddMinutes(minutes)
      setCustomMinutes("")
      setShowCustomInput(false)
    }
  }

  const calculateCost = (minutes: number) => {
    return minutes * 995
  }

  const handlePackageChange = (packageId: string) => {
    if (packageId !== currentPackage) {
      setSelectedPackage(packageId)
      setShowPackageModal(true)
    }
  }

  const confirmPackageChange = () => {
    setCurrentPackage(selectedPackage)
    setShowPackageModal(false)
    setSelectedPackage("")
  }

  if (showPaymentGateway) {
    return (
      <div className="p-6 min-h-screen bg-white">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Payment Gateway</CardTitle>
              <CardDescription>Complete your payment to add {minutesToAdd} minutes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Minutes to add:</span>
                  <span>{minutesToAdd} minutes</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Rate per minute:</span>
                  <span>UGX 995</span>
                </div>
                <div className="flex justify-between items-center font-bold text-lg border-t pt-2">
                  <span>Total Amount:</span>
                  <span>UGX {calculateCost(minutesToAdd).toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  {paymentMethod === "mtn" && <Smartphone className="h-5 w-5 text-yellow-600" />}
                  {paymentMethod === "airtel" && <Phone className="h-5 w-5 text-red-600" />}
                  {paymentMethod === "card" && <CreditCard className="h-5 w-5 text-blue-600" />}
                  <span className="font-medium">
                    {paymentMethod === "mtn" && "MTN Mobile Money"}
                    {paymentMethod === "airtel" && "Airtel Money"}
                    {paymentMethod === "card" && "Credit Card"}
                  </span>
                </div>
                <p className="text-sm text-gray-600">Payment will be processed using your selected payment method</p>
              </div>

              <div className="flex gap-4">
                <Button
                  variant="outline"
                  className="flex-1 bg-transparent"
                  onClick={() => setShowPaymentGateway(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-teal-500 hover:bg-teal-600"
                  onClick={() => {
                    setRemainingMinutes((prev) => prev + minutesToAdd)
                    setShowPaymentGateway(false)
                    setMinutesToAdd(0)
                  }}
                >
                  Confirm Payment
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 min-h-screen bg-white">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-black">Billing & Subscription</h1>
          <Badge variant="outline" className="text-teal-600 border-teal-600">
            {currentPlan?.name} Plan
          </Badge>
        </div>

        {/* Minutes Usage */}
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => toggleSection("minutes")}>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-teal-500" />
                Minutes Usage
              </div>
              {expandedSections.minutes ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </CardTitle>
            <CardDescription>Track your remaining minutes and add more as needed</CardDescription>
          </CardHeader>
          {expandedSections.minutes && (
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Remaining Minutes</span>
                  <span>
                    {remainingMinutes} / {currentPlan?.minutes || "Pay per use"}
                  </span>
                </div>
                <Progress value={currentPlan?.minutes ? minutesProgress : 0} className="h-3" />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Rate: UGX 995 per minute</span>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>Renews: {renewalDate.toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Button
                  variant="outline"
                  className="flex items-center gap-2 bg-transparent"
                  onClick={() => handleAddMinutes(10)}
                >
                  <Plus className="h-4 w-4" />
                  10 min
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 bg-transparent"
                  onClick={() => handleAddMinutes(100)}
                >
                  <Plus className="h-4 w-4" />
                  100 min
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 bg-transparent"
                  onClick={() => handleAddMinutes(1000)}
                >
                  <Plus className="h-4 w-4" />
                  1000 min
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 bg-transparent"
                  onClick={() => setShowCustomInput(!showCustomInput)}
                >
                  <Plus className="h-4 w-4" />
                  Custom
                </Button>
              </div>

              {showCustomInput && (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Enter minutes (10-10000)"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    min="10"
                    max="10000"
                  />
                  <Button onClick={handleCustomMinutes} className="bg-teal-500 hover:bg-teal-600">
                    Add
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Current Package */}
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => toggleSection("package")}>
            <CardTitle className="flex items-center justify-between">
              Current Package
              {expandedSections.package ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </CardTitle>
            <CardDescription>Manage your subscription plan</CardDescription>
          </CardHeader>
          {expandedSections.package && (
            <CardContent className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">{currentPlan?.name}</h3>
                    <p className="text-gray-600">
                      {currentPlan?.agents} agents •{" "}
                      {currentPlan?.minutes ? `${currentPlan.minutes} minutes included` : "Pay per minute"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">UGX {currentPlan?.price.toLocaleString()}</p>
                    <p className="text-sm text-gray-600">per month</p>
                    {currentPlan?.perMinute && (
                      <p className="text-sm text-gray-600">+ UGX {currentPlan.perMinute} per minute</p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="package-select">Change Package</Label>
                <Select value={currentPackage} onValueChange={handlePackageChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {packages.map((pkg) => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.name} - UGX {pkg.price.toLocaleString()}/month
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Payment Settings */}
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => toggleSection("payment")}>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-teal-500" />
                Payment Settings
              </div>
              {expandedSections.payment ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </CardTitle>
            <CardDescription>Manage your payment preferences</CardDescription>
          </CardHeader>
          {expandedSections.payment && (
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-billing">Auto-billing</Label>
                  <p className="text-sm text-gray-600">Automatically renew your subscription</p>
                </div>
                <Switch id="auto-billing" checked={autoBilling} onCheckedChange={setAutoBilling} />
              </div>

              <div className="space-y-3">
                <Label>Payment Method</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant={paymentMethod === "mtn" ? "default" : "outline"}
                      className={`flex-1 flex items-center gap-2 ${paymentMethod === "mtn" ? "bg-teal-500 hover:bg-teal-600" : ""}`}
                      onClick={() => setPaymentMethod("mtn")}
                    >
                      <Smartphone className="h-4 w-4" />
                      MTN Momo
                    </Button>
                    {paymentMethod === "mtn" && (
                      <Button variant="outline" size="sm" onClick={() => setEditingPayment(true)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={paymentMethod === "airtel" ? "default" : "outline"}
                      className={`flex-1 flex items-center gap-2 ${paymentMethod === "airtel" ? "bg-teal-500 hover:bg-teal-600" : ""}`}
                      onClick={() => setPaymentMethod("airtel")}
                    >
                      <Phone className="h-4 w-4" />
                      Airtel Money
                    </Button>
                    {paymentMethod === "airtel" && (
                      <Button variant="outline" size="sm" onClick={() => setEditingPayment(true)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={paymentMethod === "card" ? "default" : "outline"}
                      className={`flex-1 flex items-center gap-2 ${paymentMethod === "card" ? "bg-teal-500 hover:bg-teal-600" : ""}`}
                      onClick={() => setPaymentMethod("card")}
                    >
                      <CreditCard className="h-4 w-4" />
                      Credit Card
                    </Button>
                    {paymentMethod === "card" && (
                      <Button variant="outline" size="sm" onClick={() => setEditingPayment(true)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <Button variant="destructive" className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Cancel Subscription
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* Package Change Confirmation Modal */}
      <Dialog open={showPackageModal} onOpenChange={setShowPackageModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Package Change</DialogTitle>
            <DialogDescription>
              Are you sure you want to change to the {packages.find((p) => p.id === selectedPackage)?.name} plan? This
              change will take effect on your next payment date ({renewalDate.toLocaleDateString()}).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPackageModal(false)}>
              Cancel
            </Button>
            <Button onClick={confirmPackageChange} className="bg-teal-500 hover:bg-teal-600">
              Confirm Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Method Edit Modal */}
      <Dialog open={editingPayment} onOpenChange={setEditingPayment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Payment Details</DialogTitle>
            <DialogDescription>
              Update your{" "}
              {paymentMethod === "mtn"
                ? "MTN Mobile Money"
                : paymentMethod === "airtel"
                  ? "Airtel Money"
                  : "Credit Card"}{" "}
              details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {paymentMethod === "mtn" && (
              <div>
                <Label htmlFor="edit-mtn">MTN Phone Number</Label>
                <Input id="edit-mtn" placeholder="256 7XX XXX XXX" />
              </div>
            )}
            {paymentMethod === "airtel" && (
              <div>
                <Label htmlFor="edit-airtel">Airtel Phone Number</Label>
                <Input id="edit-airtel" placeholder="256 7XX XXX XXX" />
              </div>
            )}
            {paymentMethod === "card" && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="edit-card">Card Number</Label>
                  <Input id="edit-card" placeholder="1234 5678 9012 3456" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="edit-expiry">Expiry Date</Label>
                    <Input id="edit-expiry" placeholder="MM/YY" />
                  </div>
                  <div>
                    <Label htmlFor="edit-cvv">CVV</Label>
                    <Input id="edit-cvv" placeholder="123" />
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPayment(false)}>
              Cancel
            </Button>
            <Button onClick={() => setEditingPayment(false)} className="bg-teal-500 hover:bg-teal-600">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
