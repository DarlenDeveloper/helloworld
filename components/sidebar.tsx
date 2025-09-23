"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { LayoutGrid, Phone, BarChart3, Brain, Settings, BarChart, DollarSign, History, FileText, FormInput, Bell, Users, ChevronsLeft, ChevronsRight, MessageCircle, Mail } from "lucide-react"

export function Sidebar() {
  const pathname = usePathname()
  const [isExpanded, setIsExpanded] = useState(false)

  // Restore persisted state
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sidebarExpanded")
      if (saved !== null) setIsExpanded(saved === "true")
    } catch {}
  }, [])

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem("sidebarExpanded", String(isExpanded))
    } catch {}
  }, [isExpanded])

  const menuItems = [
    { icon: LayoutGrid, href: "/dashboard", label: "Dashboard", active: pathname === "/dashboard" },
    { icon: FileText, href: "/batches", label: "Batches", active: pathname?.startsWith("/batches") },
    { icon: Phone, href: "/scheduling", label: "Call Scheduling", active: pathname === "/scheduling" },
    { icon: MessageCircle, href: "/scheduling/whatsapp", label: "WhatsApp Scheduling", active: pathname === "/scheduling/whatsapp" },
    { icon: Mail, href: "/scheduling/email", label: "Email Scheduling", active: pathname === "/scheduling/email" },
    { icon: History, href: "/call-history", label: "Call History", active: pathname === "/call-history" },
    { icon: BarChart3, href: "/analytics", label: "Analytics", active: pathname === "/analytics" },
    { icon: Brain, href: "/deep-insights", label: "Deep Insights", active: pathname === "/deep-insights" },
    { icon: Brain, href: "/knowledge-base", label: "Knowledge Base", active: pathname === "/knowledge-base" },
    { icon: FormInput, href: "/forms/contact", label: "Web Forms", active: pathname === "/forms/contact" },
    { icon: Users, href: "/users", label: "Users", active: pathname === "/users" },
    { icon: Bell, href: "/notifications", label: "Notifications", active: pathname === "/notifications" },
    { icon: BarChart, href: "/reports", label: "Reports", active: pathname === "/reports" },
    { icon: DollarSign, href: "/billing", label: "Billing", active: pathname === "/billing" },
    { icon: FileText, href: "/logs", label: "User Logs", active: pathname === "/logs" },
  ]

  const handleSidebarClick = (e: React.MouseEvent) => {
    // Only toggle if clicking on the sidebar background, not on links
    if (e.target === e.currentTarget) {
      const next = !isExpanded
      setIsExpanded(next)
      try {
        window.dispatchEvent(new CustomEvent("sidebar:toggled", { detail: { isExpanded: next } }))
      } catch {}
    }
  }

  return (
    <div
      className={`flex fixed inset-y-0 left-0 z-50 h-full flex-col bg-background p-3 shadow-md transition-all my-1 gap-0.5 overflow-hidden ${
        isExpanded ? "w-64" : "w-16"
      }`}
      onClick={handleSidebarClick}
    >
      <div className="flex flex-col space-y-6 flex-1 min-h-0 overflow-y-auto scrollbar-none">
        {/* Minimizer / Expander */}
        <div className="flex items-center justify-end">
          <button
            type="button"
            aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
            title={isExpanded ? "Collapse" : "Expand"}
            onClick={(e) => {
              e.stopPropagation()
              const next = !isExpanded
              setIsExpanded(next)
              try {
                window.dispatchEvent(new CustomEvent("sidebar:toggled", { detail: { isExpanded: next } }))
              } catch {}
            }}
            className="p-2 rounded-md text-muted-foreground hover:bg-muted"
          >
            {isExpanded ? (
              <ChevronsLeft className="h-5 w-5" />
            ) : (
              <ChevronsRight className="h-5 w-5" />
            )}
          </button>
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
