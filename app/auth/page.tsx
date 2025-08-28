"use client"

import type React from "react"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Eye, EyeOff } from "lucide-react"

export default function Auth() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [orgName, setOrgName] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [role, setRole] = useState<"admin" | "manager" | "agent" | "viewer">("admin")

  // Employee sign-up state
  const [empOrgUsername, setEmpOrgUsername] = useState("")
  const [empEmail, setEmpEmail] = useState("")
  const [empPassword, setEmpPassword] = useState("")
  const [empConfirmPassword, setEmpConfirmPassword] = useState("")
  const [empFullName, setEmpFullName] = useState("")

  const router = useRouter()
  const supabase = createClient()

  const logUserLogin = async (userId: string, email: string, status: "success" | "failed") => {
    try {
      await supabase.from("user_login_logs").insert({
        user_id: userId,
        email,
        status,
        ip_address: "127.0.0.1",
        user_agent: navigator.userAgent,
        location: "Unknown",
        device: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent) ? "Mobile" : "Desktop",
      })
    } catch (err) {
      console.error("Failed to log user login:", err)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError(error.message)
      } else if (data.user) {
        await logUserLogin(data.user.id, email, "success")
        router.push("/dashboard")
        router.refresh()
      }
    } catch (err) {
      setError("An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess("")

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long")
      setLoading(false)
      return
    }

    if (!fullName.trim()) {
      setError("Full name is required")
      setLoading(false)
      return
    }

    if (!orgName.trim()) {
      setError("Organization name is required")
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/dashboard`,
          data: {
            full_name: fullName.trim(),
            org_name: orgName.trim(),
            role,
          },
        },
      })

      if (error) {
        setError(error.message)
      } else if (data.user) {
        setSuccess("Account created. Check your email for a verification link!")
        resetForm()
      }
    } catch (err) {
      setError("An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleEmployeeSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess("")

    if (!empOrgUsername.trim()) {
      setError("Organization username is required")
      setLoading(false)
      return
    }
    if (!empFullName.trim()) {
      setError("Full name is required")
      setLoading(false)
      return
    }
    if (empPassword !== empConfirmPassword) {
      setError("Passwords do not match")
      setLoading(false)
      return
    }
    if (empPassword.length < 6) {
      setError("Password must be at least 6 characters long")
      setLoading(false)
      return
    }

    try {
      // Resolve organization by username (unique)
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('id, username')
        .eq('username', empOrgUsername.trim().toLowerCase())
        .single()
      if (orgErr || !org) {
        setError("Organization not found. Check the organization username.")
        setLoading(false)
        return
      }

      // Check pending invite for this email under the org
      const { data: inviteRows, error: inviteErr } = await supabase
        .from('organization_invites')
        .select('id')
        .eq('organization_id', org.id)
        .eq('email', empEmail.trim().toLowerCase())
        .eq('status', 'pending')
        .limit(1)
      if (inviteErr || !inviteRows || inviteRows.length === 0) {
        setError("You must be invited to join this organization. Please ask an admin to invite your email.")
        setLoading(false)
        return
      }

      // Proceed with sign up
      const { data, error: signErr } = await supabase.auth.signUp({
        email: empEmail,
        password: empPassword,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/dashboard`,
          data: {
            full_name: empFullName.trim(),
            role: 'agent',
            org_name: org.username, // optional metadata for logging/UI
          },
        },
      })

      if (signErr) {
        setError(signErr.message)
      } else if (data.user) {
        setSuccess("Account created. Check your email for a verification link!")
        setEmpOrgUsername("")
        setEmpEmail("")
        setEmpPassword("")
        setEmpConfirmPassword("")
        setEmpFullName("")
      }
    } catch (err) {
      setError("An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setEmail("")
    setPassword("")
    setConfirmPassword("")
    setFullName("")
    setOrgName("")
    setError("")
    setSuccess("")
    setShowPassword(false)
    setShowConfirmPassword(false)
    setRole("admin")
    setEmpOrgUsername("")
    setEmpEmail("")
    setEmpPassword("")
    setEmpConfirmPassword("")
    setEmpFullName("")
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Auth Form */}
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50 p-8">
        <Card className="w-full max-w-md shadow-xl bg-white/60 backdrop-blur border border-white/40">
          <CardHeader className="pb-4" />
          <CardContent className="pb-8">
            <Tabs defaultValue="signin" className="w-full" onValueChange={resetForm}>
              <TabsList className="grid w-full grid-cols-3 mb-8">
                <TabsTrigger value="signin" className="text-sm font-medium">
                  Sign In
                </TabsTrigger>
                <TabsTrigger value="signup" className="text-sm font-medium">
                  Sign Up (Admin)
                </TabsTrigger>
                <TabsTrigger value="employee-signup" className="text-sm font-medium">
                  Employee Sign Up
                </TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="space-y-6">
                <form onSubmit={handleLogin} className="space-y-6">
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="signin-email" className="text-sm font-medium">
                      Email Address
                    </Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signin-password" className="text-sm font-medium">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="signin-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={loading}
                        className="h-12 pr-12"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-12 px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={loading}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full h-12 text-base font-medium" disabled={loading}>
                    {loading ? "Signing in..." : "Sign In"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="space-y-6">
                <form onSubmit={handleSignUp} className="space-y-6">
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  {success && (
                    <Alert className="border-green-200 bg-green-50">
                      <AlertDescription className="text-green-800">{success}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="signup-fullname" className="text-sm font-medium">
                      Full Name
                    </Label>
                    <Input
                      id="signup-fullname"
                      type="text"
                      placeholder="Enter your full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      disabled={loading}
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-orgname" className="text-sm font-medium">
                      Organization Name
                    </Label>
                    <Input
                      id="signup-orgname"
                      type="text"
                      placeholder="Enter your organization name"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      required
                      disabled={loading}
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-sm font-medium">
                      Email Address
                    </Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-role" className="text-sm font-medium">
                      Your Role
                    </Label>
                    <Select value={role} onValueChange={(v) => setRole(v as any)}>
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrator</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="agent">Agent</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-sm font-medium">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Create a password (min. 6 characters)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={loading}
                        className="h-12 pr-12"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-12 px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={loading}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password" className="text-sm font-medium">
                      Confirm Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm your password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        disabled={loading}
                        className="h-12 pr-12"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-12 px-3 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        disabled={loading}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full h-12 text-base font-medium" disabled={loading}>
                    {loading ? "Creating account..." : "Create Account"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="employee-signup" className="space-y-6">
                <form onSubmit={handleEmployeeSignUp} className="space-y-6">
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  {success && (
                    <Alert className="border-green-200 bg-green-50">
                      <AlertDescription className="text-green-800">{success}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="emp-org-username" className="text-sm font-medium">
                      Organization Username
                    </Label>
                    <Input
                      id="emp-org-username"
                      type="text"
                      placeholder="your-company"
                      value={empOrgUsername}
                      onChange={(e) => setEmpOrgUsername(e.target.value)}
                      required
                      disabled={loading}
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emp-fullname" className="text-sm font-medium">
                      Full Name
                    </Label>
                    <Input
                      id="emp-fullname"
                      type="text"
                      placeholder="Enter your full name"
                      value={empFullName}
                      onChange={(e) => setEmpFullName(e.target.value)}
                      required
                      disabled={loading}
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emp-email" className="text-sm font-medium">
                      Email Address
                    </Label>
                    <Input
                      id="emp-email"
                      type="email"
                      placeholder="Enter your email"
                      value={empEmail}
                      onChange={(e) => setEmpEmail(e.target.value)}
                      required
                      disabled={loading}
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emp-password" className="text-sm font-medium">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="emp-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Create a password (min. 6 characters)"
                        value={empPassword}
                        onChange={(e) => setEmpPassword(e.target.value)}
                        required
                        disabled={loading}
                        className="h-12 pr-12"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-12 px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={loading}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emp-confirm-password" className="text-sm font-medium">
                      Confirm Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="emp-confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm your password"
                        value={empConfirmPassword}
                        onChange={(e) => setEmpConfirmPassword(e.target.value)}
                        required
                        disabled={loading}
                        className="h-12 pr-12"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-12 px-3 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        disabled={loading}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full h-12 text-base font-medium" disabled={loading}>
                    {loading ? "Creating account..." : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

    </div>
  )
}
