"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function LoginRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/auth")
  }, [router])

  return (
    <div className="min-h-screen w-full bg-white flex items-center justify-center p-4">
      <div className="text-center text-gray-600">Redirecting to login...</div>
    </div>
  )
}
