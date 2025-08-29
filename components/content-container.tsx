"use client"

import React, { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

export function ContentContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isExpanded, setIsExpanded] = useState(false)

  // Auth pages should not reserve space for sidebar
  const isAuthPage =
    pathname?.startsWith("/login") || pathname?.startsWith("/sign-up") || pathname?.startsWith("/auth")

  useEffect(() => {
    // Initialize from localStorage
    try {
      const saved = localStorage.getItem("sidebarExpanded")
      if (saved !== null) setIsExpanded(saved === "true")
    } catch {}

    // Listen for custom toggle events from the Sidebar
    const onToggle = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail && typeof detail.isExpanded === "boolean") {
        setIsExpanded(detail.isExpanded)
      }
    }

    // Fallback: listen for storage updates (cross-tab)
    const onStorage = (e: StorageEvent) => {
      if (e.key === "sidebarExpanded" && e.newValue != null) {
        setIsExpanded(e.newValue === "true")
      }
    }

    window.addEventListener("sidebar:toggled", onToggle as EventListener)
    window.addEventListener("storage", onStorage)

    return () => {
      window.removeEventListener("sidebar:toggled", onToggle as EventListener)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  if (isAuthPage) {
    return <main className="min-h-screen">{children}</main>
  }

  // Reserve space for the fixed sidebar on md+ screens only
  const paddingClasses = isExpanded ? "pl-0 sm:pl-64" : "pl-0 sm:pl-16"

  return (
    <main className={`min-h-screen transition-[padding] duration-200 ${paddingClasses}`}>
      {children}
    </main>
  )
}
