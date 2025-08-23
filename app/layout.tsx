import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import "./globals.css"
import { ClientSidebar } from "@/components/client-sidebar"

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
    <html lang="en">
      <head>
        <style>{`
html {
  font-family: ${GeistSans.style.fontFamily};
  --font-sans: ${GeistSans.variable};
  --font-mono: ${GeistMono.variable};
}
        `}</style>
      </head>
      <body>
        <ConditionalLayout>{children}</ConditionalLayout>
      </body>
    </html>
  )
}

function ConditionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <ConditionalSidebar />
      <main className="flex-1 transition-all duration-300">{children}</main>
    </div>
  )
}

function ConditionalSidebar() {
  // This will be handled client-side to check the current path
  return <ClientSidebar />
}
