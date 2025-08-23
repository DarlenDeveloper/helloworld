"use client"

import { usePathname } from "next/navigation"
import { Sidebar } from "./sidebar"

export function ClientSidebar() {
  const pathname = usePathname()

  // Hide sidebar on auth pages
  const isAuthPage =
    pathname?.startsWith("/login") || pathname?.startsWith("/sign-up") || pathname?.startsWith("/auth")

  if (isAuthPage) {
    return null
  }

  return <Sidebar />
}
