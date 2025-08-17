"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Eye, EyeOff, Bot, Building2 } from "lucide-react"

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    password: "",
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle login logic here
    console.log("Login attempt:", formData)
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-500 rounded-2xl mb-4">
            <Bot className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-black mb-2">AI Agent Dashboard</h1>
          <p className="text-gray-600">Sign in to manage your customer service operations</p>
        </div>

        {/* Login Card */}
        <Card className="border border-gray-200 shadow-lg">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-xl font-semibold text-black text-center">Employee Login</CardTitle>
            <CardDescription className="text-center text-gray-600">
              Enter your credentials to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Company Email Field */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-black flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-teal-500" />
                  Company Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="company@example.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className="border-gray-300 focus:border-teal-500 focus:ring-teal-500"
                  required
                />
                <p className="text-xs text-gray-500">This identifies your company in our system</p>
              </div>

              {/* Username Field */}
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium text-black">
                  Username
                </Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="john.doe"
                  value={formData.username}
                  onChange={(e) => handleInputChange("username", e.target.value)}
                  className="border-gray-300 focus:border-teal-500 focus:ring-teal-500"
                  required
                />
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-black">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={(e) => handleInputChange("password", e.target.value)}
                    className="border-gray-300 focus:border-teal-500 focus:ring-teal-500 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me and Forgot Password */}
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" className="rounded border-gray-300 text-teal-500 focus:ring-teal-500" />
                  <span className="text-gray-600">Remember me</span>
                </label>
                <button type="button" className="text-teal-500 hover:text-teal-600 font-medium">
                  Forgot password?
                </button>
              </div>

              {/* Login Button */}
              <Button type="submit" className="w-full bg-teal-500 hover:bg-teal-600 text-white font-medium py-2.5">
                Sign In
              </Button>
            </form>

            {/* Additional Info */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-center text-sm text-gray-600">
                Need access to the dashboard?{" "}
                <button className="text-teal-500 hover:text-teal-600 font-medium">Contact your administrator</button>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-500">
          <p>© 2024 AI Agent Dashboard. All rights reserved.</p>
          <p className="mt-1">Secure customer service management platform</p>
        </div>
      </div>
    </div>
  )
}
