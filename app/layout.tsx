import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import "./globals.css"
import { ClientSidebar } from "@/components/client-sidebar"
import { ContentContainer } from "@/components/content-container"

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export const metadata: Metadata = {
  title: "AI Agent Dashboard",
  description: "AI Customer Service Agent Management Platform",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <ConditionalLayout>{children}</ConditionalLayout>
      </body>
    </html>
  )
}

// Uses React Server Components, so we can't directly access pathname here
// But we can check for specific pages based on the children content
function ConditionalLayout({ children }: { children: React.ReactNode }) {
  // We pass the children through regardless - the ClientSidebar component
  // will handle showing/hiding itself based on the current path
  return (
    <>
      <ClientSidebar />
      <ContentContainer>{children}</ContentContainer>
    </>
  )
}
