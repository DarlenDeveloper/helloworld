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
