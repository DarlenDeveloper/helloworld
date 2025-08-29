import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import "./globals.css"
import { ClientSidebar } from "@/components/client-sidebar"
import { ContentContainer } from "@/components/content-container"

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
