"use client"

import type React from "react"

import { useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { LayoutGrid, Phone, BarChart3, Brain, Settings, BarChart, DollarSign, History, FileText } from "lucide-react"

export function Sidebar() {
  const pathname = usePathname()
  const [isExpanded, setIsExpanded] = useState(false)

  const menuItems = [
    { icon: LayoutGrid, href: "/", label: "Dashboard", active: pathname === "/" },
    { icon: Phone, href: "/scheduling", label: "Call Scheduling", active: pathname === "/scheduling" },
    { icon: History, href: "/call-history", label: "Call History", active: pathname === "/call-history" },
    { icon: BarChart3, href: "/analytics", label: "Analytics", active: pathname === "/analytics" },
    { icon: Brain, href: "/knowledge-base", label: "Knowledge Base", active: pathname === "/knowledge-base" },
    { icon: BarChart, href: "/reports", label: "Reports", active: pathname === "/reports" },
    { icon: DollarSign, href: "/billing", label: "Billing", active: pathname === "/billing" },
    { icon: FileText, href: "/logs", label: "User Logs", active: pathname === "/logs" },
  ]

  const handleSidebarClick = (e: React.MouseEvent) => {
    // Only toggle if clicking on the sidebar background, not on links
    if (e.target === e.currentTarget) {
      setIsExpanded(!isExpanded)
    }
  }

  return (
    <div
      className={`fixed inset-y-0 left-0 z-50 flex h-full flex-col bg-background p-3 shadow-md transition-all ${
        isExpanded ? "w-64" : "w-16"
      }`}
      onClick={handleSidebarClick}
    >
      <div className="flex flex-col space-y-6">
        <div className="flex h-16 items-center justify-center">
          <img
            src="/placeholder-logo.svg"
            alt="Logo"
            className={`h-8 transition-all ${isExpanded ? "w-auto" : "w-8"}`}
          />
        </div>
        <nav className="flex flex-col space-y-2">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-md p-3 transition-all ${
                item.active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {isExpanded && <span className="ml-3">{item.label}</span>}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mt-auto">
        <Link
          href="/settings"
          className={`flex items-center rounded-md p-3 transition-all ${
            pathname === "/settings"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Settings className="h-5 w-5" />
          {isExpanded && <span className="ml-3">Settings</span>}
        </Link>
      </div>
    </div>
  )
}
