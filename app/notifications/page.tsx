"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface InvitationRow {
  id: string
  owner_user_id: string
  invitee_email: string
  role: "viewer" | "editor"
  status: "pending" | "accepted" | "revoked" | "expired"
  created_at: string
  expires_at: string | null
}

export default function NotificationsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [invitations, setInvitations] = useState<InvitationRow[]>([])
  const [accepting, setAccepting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        setUserEmail(user.email ?? null)
        await fetchInvites(user.email ?? undefined)
      } finally {
        setLoading(false)
      }
    }
    run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchInvites = async (inviteeEmail?: string) => {
    setError(null)
    if (!inviteeEmail) { setInvitations([]); return }
    const { data, error } = await supabase
      .from("user_collaboration_invitations")
      .select("id, owner_user_id, invitee_email, role, status, created_at, expires_at")
      .eq("status", "pending")
      .eq("invitee_email", inviteeEmail)
      .order("created_at", { ascending: false })
    if (error) { setError(error.message); setInvitations([]); return }
    setInvitations((data || []) as InvitationRow[])
  }

  const accept = async (id: string) => {
    setAccepting(id)
    setError(null)
    try {
      const resp = await fetch(`/api/collaborators/invitations/${id}/accept`, { method: "POST" })
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}))
        throw new Error(j?.error || `Failed to accept: ${resp.status}`)
      }
      await fetchInvites(userEmail ?? undefined)
    } catch (e: any) {
      setError(String(e.message || e))
    } finally {
      setAccepting(null)
    }
  }

  if (loading) {
    return (
      <div className="ml-20 p-6 min-h-screen flex items-center justify-center text-gray-600">Loading notifications...</div>
    )
  }

  return (
    <div className="ml-20 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-black">Notifications</h1>
          <p className="text-gray-600 mt-1">Pending collaboration invitations for {userEmail || "your account"}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Collaboration Invitations</CardTitle>
            <CardDescription>Accept invitations to access an owner's data as a collaborator</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-3 text-sm text-red-600">{error}</div>
            )}
            {invitations.length === 0 ? (
              <div className="text-sm text-gray-600">No pending invitations.</div>
            ) : (
              <div className="space-y-3">
                {invitations.map((inv) => {
                  const roleLabel = inv.role === "editor" ? "major" : "mini"
                  const exp = inv.expires_at ? new Date(inv.expires_at).toLocaleString() : null
                  return (
                    <div key={inv.id} className="border rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm text-black">
                          Invitation to collaborate as <span className="font-semibold">{roleLabel}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          Sent: {new Date(inv.created_at).toLocaleString()}
                          {exp ? ` • Expires: ${exp}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" disabled={accepting === inv.id} onClick={() => accept(inv.id)}>
                          {accepting === inv.id ? "Accepting..." : "Accept"}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
