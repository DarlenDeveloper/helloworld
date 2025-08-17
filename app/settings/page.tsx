"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload, Plus, Edit, Trash2, Shield, Clock, Palette, Key } from "lucide-react"

export default function SettingsPage() {
  const [currentUser] = useState({ role: "admin", name: "John Doe" })
  const [users, setUsers] = useState([
    { id: 1, name: "John Doe", email: "john@company.com", role: "admin", status: "active" },
    { id: 2, name: "Jane Smith", email: "jane@company.com", role: "manager", status: "active" },
    { id: 3, name: "Mike Johnson", email: "mike@company.com", role: "agent", status: "inactive" },
  ])
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [selectedTimezone, setSelectedTimezone] = useState("UTC+3 (East Africa Time)")
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const permissions = {
    admin: [
      "Dashboard",
      "Call Scheduling",
      "Call History",
      "Analytics",
      "Knowledge Base",
      "Reports",
      "Billing",
      "Settings",
      "User Management",
    ],
    manager: ["Dashboard", "Call Scheduling", "Call History", "Analytics", "Knowledge Base", "Reports"],
    agent: ["Dashboard", "Call Scheduling", "Call History"],
  }

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setLogoFile(file)
      // In a real app, you would upload this to your server
      console.log("[v0] Logo file selected:", file.name)
    }
  }

  const handleAddUser = (userData: any) => {
    const newUser = {
      id: users.length + 1,
      ...userData,
      status: "active",
    }
    setUsers([...users, newUser])
    setIsAddUserOpen(false)
  }

  const handleDeleteUser = (userId: number) => {
    setUsers(users.filter((user) => user.id !== userId))
  }

  // Only admins can access settings
  if (currentUser.role !== "admin") {
    return (
      <div className="ml-20 p-6 flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-500" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You don't have permission to access the settings page. Only administrators can manage system settings.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="ml-20 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-black">Settings</h1>
          <p className="text-gray-600 mt-2">Manage system configuration, user roles, and preferences</p>
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="general">General Settings</TabsTrigger>
            <TabsTrigger value="customization">Customization</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>User Roles & Permissions</CardTitle>
                    <CardDescription>Manage user accounts and their access levels</CardDescription>
                  </div>
                  <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-teal-500 hover:bg-teal-600">
                        <Plus className="h-4 w-4 mr-2" />
                        Add User
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New User</DialogTitle>
                        <DialogDescription>Create a new user account with appropriate permissions</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="name">Full Name</Label>
                          <Input id="name" placeholder="Enter full name" />
                        </div>
                        <div>
                          <Label htmlFor="email">Email Address</Label>
                          <Input id="email" type="email" placeholder="Enter email address" />
                        </div>
                        <div>
                          <Label htmlFor="role">Role</Label>
                          <Select>
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Administrator</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="agent">Agent</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddUserOpen(false)}>
                          Cancel
                        </Button>
                        <Button className="bg-teal-500 hover:bg-teal-600" onClick={() => handleAddUser({})}>
                          Add User
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              user.role === "admin" ? "default" : user.role === "manager" ? "secondary" : "outline"
                            }
                          >
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.status === "active" ? "default" : "secondary"}>{user.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleDeleteUser(user.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Permissions Matrix</CardTitle>
                <CardDescription>View permissions for each role</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(permissions).map(([role, perms]) => (
                    <div key={role} className="border rounded-lg p-4">
                      <h4 className="font-semibold mb-3 capitalize">{role}</h4>
                      <div className="flex flex-wrap gap-2">
                        {perms.map((permission) => (
                          <Badge key={permission} variant="outline">
                            {permission}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Time Zone Settings
                </CardTitle>
                <CardDescription>Configure system time zone preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="timezone">Default Time Zone</Label>
                  <Select value={selectedTimezone} onValueChange={setSelectedTimezone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC+3 (East Africa Time)">UTC+3 (East Africa Time)</SelectItem>
                      <SelectItem value="UTC+0 (GMT)">UTC+0 (GMT)</SelectItem>
                      <SelectItem value="UTC-5 (EST)">UTC-5 (EST)</SelectItem>
                      <SelectItem value="UTC-8 (PST)">UTC-8 (PST)</SelectItem>
                      <SelectItem value="UTC+1 (CET)">UTC+1 (CET)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="bg-teal-500 hover:bg-teal-600">Save Time Zone</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customization" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Company Branding
                </CardTitle>
                <CardDescription>Customize your company's appearance in the system</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="logo">Company Logo</Label>
                  <div className="mt-2 flex items-center gap-4">
                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                      {logoFile ? (
                        <img
                          src={URL.createObjectURL(logoFile) || "/placeholder.svg"}
                          alt="Logo preview"
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <Upload className="h-6 w-6 text-gray-400" />
                      )}
                    </div>
                    <div>
                      <input type="file" id="logo" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      <Button variant="outline" onClick={() => document.getElementById("logo")?.click()}>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Logo
                      </Button>
                      <p className="text-sm text-gray-500 mt-1">Recommended: 64x64px, PNG or JPG</p>
                    </div>
                  </div>
                </div>
                <Button className="bg-teal-500 hover:bg-teal-600">Save Branding</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Two-Factor Authentication
                </CardTitle>
                <CardDescription>Enhance security with Google Authenticator</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="2fa">Enable Two-Factor Authentication</Label>
                    <p className="text-sm text-gray-500">Require authentication codes from Google Authenticator</p>
                  </div>
                  <Switch id="2fa" checked={twoFactorEnabled} onCheckedChange={setTwoFactorEnabled} />
                </div>
                {twoFactorEnabled && (
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <h4 className="font-medium mb-2">Setup Instructions</h4>
                    <ol className="text-sm space-y-1 list-decimal list-inside">
                      <li>Download Google Authenticator app</li>
                      <li>Scan the QR code below</li>
                      <li>Enter the 6-digit code to verify</li>
                    </ol>
                    <div className="mt-4 p-4 bg-white border rounded text-center">
                      <div className="w-32 h-32 bg-gray-200 mx-auto mb-2 flex items-center justify-center">QR Code</div>
                      <Input placeholder="Enter verification code" className="max-w-48 mx-auto" />
                      <Button className="mt-2 bg-teal-500 hover:bg-teal-600">Verify</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
