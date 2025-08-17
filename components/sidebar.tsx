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
      className={`fixed left-0 top-0 h-screen bg-black flex flex-col py-6 z-10 transition-all duration-300 cursor-pointer ${
        isExpanded ? "w-64" : "w-20"
      }`}
      onClick={handleSidebarClick}
    >
      {/* Logo */}
      <div className={`flex items-center mb-8 ${isExpanded ? "px-6" : "justify-center"}`}>
        <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center">
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
            <span className="text-teal-600 font-bold text-sm">A</span>
          </div>
        </div>
        {isExpanded && (
          <div className="ml-3">
            <h2 className="text-white font-semibold text-lg">AI Agents</h2>
            <p className="text-gray-400 text-sm">Customer Service</p>
          </div>
        )}
      </div>

      {/* Menu Items */}
      <div className="flex flex-col gap-2 flex-1 px-3">
        {menuItems.map((item, index) => (
          <div key={index} className="relative group">
            <Link
              href={item.href}
              className={`flex items-center rounded-xl transition-colors ${
                isExpanded ? "px-4 py-3" : "w-12 h-12 justify-center"
              } ${item.active ? "bg-teal-500 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}
            >
              <item.icon className="h-6 w-6" />
              {isExpanded && <span className="ml-3 font-medium">{item.label}</span>}
            </Link>
            {!isExpanded && (
              <div className="absolute left-16 top-1/2 transform -translate-y-1/2 bg-gray-800 text-white px-2 py-1 rounded text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-20">
                {item.label}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Settings */}
      <div className="px-3">
        <div className="relative group">
          <Link
            href="/settings"
            className={`flex items-center rounded-xl transition-colors ${
              isExpanded ? "px-4 py-3 w-full" : "w-12 h-12 justify-center"
            } ${pathname === "/settings" ? "bg-teal-500 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}
          >
            <Settings className="h-6 w-6" />
            {isExpanded && <span className="ml-3 font-medium">Settings</span>}
          </Link>
          {!isExpanded && (
            <div className="absolute left-16 top-1/2 transform -translate-y-1/2 bg-gray-800 text-white px-2 py-1 rounded text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-20">
              Settings
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
