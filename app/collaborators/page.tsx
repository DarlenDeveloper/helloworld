"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface CollaboratorRow {
  id: string
  owner_user_id: string
  collaborator_user_id: string
  role: "viewer" | "editor"
  created_at: string
}

interface InvitationRow {
  id: string
  invitee_email: string
  role: "viewer" | "editor"
  status: "pending" | "accepted" | "revoked" | "expired"
  created_at: string
}

export default function CollaboratorsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [myId, setMyId] = useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"mini" | "major">("mini")
  const [inviting, setInviting] = useState(false)

  const [collaborators, setCollaborators] = useState<CollaboratorRow[]>([])
  const [invitations, setInvitations] = useState<InvitationRow[]>([])
  const [updating, setUpdating] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        setMyId(user.id)
        await Promise.all([fetchCollaborators(), fetchInvitations()])
      } finally { setLoading(false) }
    }
    run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchCollaborators = async () => {
    setError(null)
    const resp = await fetch("/api/collaborators")
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}))
      setError(j?.error || `Failed to fetch collaborators (${resp.status})`)
      setCollaborators([])
      return
    }
    const j = await resp.json()
    setCollaborators((j?.collaborators || []) as CollaboratorRow[])
  }

  const fetchInvitations = async () => {
    setError(null)
    const resp = await fetch("/api/collaborators/invitations")
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}))
      setError(j?.error || `Failed to fetch invitations (${resp.status})`)
      setInvitations([])
      return
    }
    const j = await resp.json()
    setInvitations((j?.invitations || []) as InvitationRow[])
  }

  const sendInvite = async () => {
    setInviting(true)
    setError(null)
    try {
      const resp = await fetch("/api/collaborators/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitee_email: inviteEmail.trim(), role: inviteRole })
      })
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}))
        throw new Error(j?.error || `Failed to create invitation (${resp.status})`)
      }
      setInviteEmail("")
      await fetchInvitations()
    } catch (e: any) {
      setError(String(e.message || e))
    } finally {
      setInviting(false)
    }
  }

  const updateRole = async (collaborator_user_id: string, newRole: "mini" | "major") => {
    setUpdating(collaborator_user_id)
    setError(null)
    try {
      const resp = await fetch("/api/collaborators", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collaborator_user_id, action: "update", role: newRole })
      })
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}))
        throw new Error(j?.error || `Failed to update collaborator (${resp.status})`)
      }
      await fetchCollaborators()
    } catch (e: any) {
      setError(String(e.message || e))
    } finally { setUpdating(null) }
  }

  const removeCollab = async (collaborator_user_id: string) => {
    setRemoving(collaborator_user_id)
    setError(null)
    try {
      const resp = await fetch("/api/collaborators", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collaborator_user_id, action: "remove" })
      })
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}))
        throw new Error(j?.error || `Failed to remove collaborator (${resp.status})`)
      }
      await fetchCollaborators()
    } catch (e: any) {
      setError(String(e.message || e))
    } finally { setRemoving(null) }
  }

  const revokeInvite = async (id: string) => {
    setRevoking(id)
    setError(null)
    try {
      const resp = await fetch(`/api/collaborators/invitations/${id}/revoke`, { method: "POST" })
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}))
        throw new Error(j?.error || `Failed to revoke invitation (${resp.status})`)
      }
      await fetchInvitations()
    } catch (e: any) {
      setError(String(e.message || e))
    } finally { setRevoking(null) }
  }

  if (loading) {
    return <div className="ml-20 p-6 min-h-screen flex items-center justify-center text-gray-600">Loading collaborators...</div>
  }

  return (
    <div className="ml-20 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-black">Collaborators</h1>
          <p className="text-gray-600 mt-1">Invite collaborators and manage their access</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Invite Collaborator</CardTitle>
            <CardDescription>Invite an authenticated user by email to access your data</CardDescription>
          </CardHeader>
          <CardContent>
            {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
            <div className="flex flex-col md:flex-row gap-2 max-w-2xl">
              <div className="flex-1">
                <Label>Email</Label>
                <Input type="email" placeholder="user@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              </div>
              <div className="w-48">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mini">mini (viewer)</SelectItem>
                    <SelectItem value="major">major (editor)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}> {inviting ? "Sending..." : "Send Invite"} </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Collaborators</CardTitle>
              <CardDescription>Update role or remove collaborators</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Collaborator</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Since</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collaborators.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-gray-600">No collaborators.</TableCell></TableRow>
                  ) : (
                    collaborators.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm">{c.collaborator_user_id}</TableCell>
                        <TableCell>
                          <Select value={c.role === "editor" ? "major" : "mini"} onValueChange={(v) => updateRole(c.collaborator_user_id, v as any)} disabled={updating === c.collaborator_user_id}>
                            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mini">mini (viewer)</SelectItem>
                              <SelectItem value="major">major (editor)</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-xs text-gray-500">{new Date(c.created_at).toLocaleString()}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" className="text-red-600" onClick={() => removeCollab(c.collaborator_user_id)} disabled={removing === c.collaborator_user_id}>
                            {removing === c.collaborator_user_id ? "Removing..." : "Remove"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invitations</CardTitle>
              <CardDescription>Pending and recent invitations you’ve sent</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-gray-600">No invitations.</TableCell></TableRow>
                  ) : (
                    invitations.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>{i.invitee_email}</TableCell>
                        <TableCell className="capitalize">{i.role === "editor" ? "major" : "mini"}</TableCell>
                        <TableCell>{i.status}</TableCell>
                        <TableCell className="text-xs text-gray-500">{new Date(i.created_at).toLocaleString()}</TableCell>
                        <TableCell>
                          {i.status === "pending" ? (
                            <Button variant="outline" size="sm" className="text-red-600" onClick={() => revokeInvite(i.id)} disabled={revoking === i.id}>
                              {revoking === i.id ? "Revoking..." : "Revoke"}
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
