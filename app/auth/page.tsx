"use client"

import type React from "react"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Eye, EyeOff, Bot, Phone, Users, BarChart3, Zap } from "lucide-react"

export default function Auth() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const router = useRouter()
  const supabase = createClient()

  const logUserLogin = async (userId: string, email: string, status: "success" | "failed") => {
    try {
      await supabase.from("user_login_logs").insert({
        user_id: userId,
        email,
        status,
        ip_address: "127.0.0.1", // In production, get real IP
        user_agent: navigator.userAgent,
        location: "Unknown", // In production, use geolocation
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
        if (data?.user?.id) {
          await logUserLogin(data.user.id, email, "failed")
        }
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

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/dashboard`,
          data: {
            full_name: fullName.trim(),
          },
        },
      })

      if (error) {
        setError(error.message)
      } else if (data.user) {
        setSuccess("Check your email for a verification link!")
        setEmail("")
        setPassword("")
        setConfirmPassword("")
        setFullName("")
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
    setError("")
    setSuccess("")
    setShowPassword(false)
    setShowConfirmPassword(false)
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Auth Form */}
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50 p-8">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center pb-8">
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl shadow-lg">
                <Bot className="h-10 w-10 text-white" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              AIRIES AI CRM
            </CardTitle>
            <CardDescription className="text-lg text-gray-600 mt-2">
              Your Intelligent Customer Companion
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            <Tabs defaultValue="signin" className="w-full" onValueChange={resetForm}>
              <TabsList className="grid w-full grid-cols-2 mb-8">
                <TabsTrigger value="signin" className="text-sm font-medium">
                  Sign In
                </TabsTrigger>
                <TabsTrigger value="signup" className="text-sm font-medium">
                  Sign Up
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
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Right side - Features Showcase */}
      <div className="flex-1 bg-gradient-to-br from-emerald-600 to-teal-700 p-8 flex items-center justify-center">
        <div className="max-w-lg text-white">
          <h2 className="text-4xl font-bold mb-8">Transform Your Customer Experience</h2>

          <div className="space-y-8">
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
                <Phone className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Smart Call Management</h3>
                <p className="text-emerald-100">
                  AI-powered call routing and intelligent conversation insights to maximize every customer interaction.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Customer Intelligence</h3>
                <p className="text-emerald-100">
                  Deep customer profiles with behavioral analytics and predictive engagement recommendations.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
                <BarChart3 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Real-time Analytics</h3>
                <p className="text-emerald-100">
                  Comprehensive dashboards with actionable insights to drive business growth and performance.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
                <Zap className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Automated Workflows</h3>
                <p className="text-emerald-100">
                  Streamline operations with intelligent automation and seamless integrations.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12 p-6 bg-white/10 rounded-xl backdrop-blur-sm">
            <p className="text-lg font-medium mb-2">Join thousands of businesses</p>
            <p className="text-emerald-100">
              Already using AIRIES AI to revolutionize their customer relationships and drive unprecedented growth.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
