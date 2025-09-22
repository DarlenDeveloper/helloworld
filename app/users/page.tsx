"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type Membership = {
  id: string
  owner_user_id: string
  member_user_id: string
  role: string
  is_active: boolean
  created_at: string
}

export default function UsersPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"mini" | "major">("mini")
  const [inviting, setInviting] = useState(false)

  const [rows, setRows] = useState<Membership[]>([])
  const [updating, setUpdating] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        await load()
      } finally {
        setLoading(false)
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = async () => {
    setError(null)
    const resp = await fetch("/api/collaborators")
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}))
      setError(j?.error || `Failed to load users (${resp.status})`)
      setRows([])
      return
    }
    const j = await resp.json()
    const mapped = (j?.collaborators || []).map((c: any) => ({
      id: c.id,
      owner_user_id: c.owner_user_id,
      member_user_id: c.collaborator_user_id,
      role: c.role === "editor" ? "admin" : "user",
      is_active: true,
      created_at: c.created_at,
    })) as Membership[]
    setRows(mapped)
  }

  const sendInvite = async () => {
    setInviting(true)
    setError(null)
    try {
      const resp = await fetch("/api/collaborators/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitee_email: inviteEmail.trim(), role: inviteRole }),
      })
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}))
        throw new Error(j?.error || `Failed to add user (${resp.status})`)
      }
      setInviteEmail("")
      await load()
    } catch (e: any) {
      setError(String(e.message || e))
    } finally {
      setInviting(false)
    }
  }

  const updateRole = async (member_user_id: string, newRole: "mini" | "major") => {
    setUpdating(member_user_id)
    setError(null)
    try {
      const resp = await fetch("/api/collaborators", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collaborator_user_id: member_user_id, action: "update", role: newRole }),
      })
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}))
        throw new Error(j?.error || `Failed to update user (${resp.status})`)
      }
      await load()
    } catch (e: any) {
      setError(String(e.message || e))
    } finally {
      setUpdating(null)
    }
  }

  const removeUser = async (member_user_id: string) => {
    setRemoving(member_user_id)
    setError(null)
    try {
      const resp = await fetch("/api/collaborators", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collaborator_user_id: member_user_id, action: "remove" }),
      })
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}))
        throw new Error(j?.error || `Failed to remove user (${resp.status})`)
      }
      await load()
    } catch (e: any) {
      setError(String(e.message || e))
    } finally {
      setRemoving(null)
    }
  }

  if (loading) {
    return <div className="ml-20 p-6 min-h-screen flex items-center justify-center text-gray-600">Loading users...</div>
  }

  return (
    <div className="ml-20 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-black">Users</h1>
          <p className="text-gray-600 mt-1">Add authenticated users to access your data</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Add User</CardTitle>
            <CardDescription>Enter an email and role. If the user doesn't exist, they will be created.</CardDescription>
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
                    <SelectItem value="mini">mini (user)</SelectItem>
                    <SelectItem value="major">major (admin)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}> {inviting ? "Adding..." : "Add User"} </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>Manage access for users on your account</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-gray-600">No users.</TableCell></TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.member_user_id}</TableCell>
                      <TableCell>
                        <Select value={r.role === "admin" ? "major" : "mini"} onValueChange={(v) => updateRole(r.member_user_id, v as any)} disabled={updating === r.member_user_id}>
                          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mini">mini (user)</SelectItem>
                            <SelectItem value="major">major (admin)</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" className="text-red-600" onClick={() => removeUser(r.member_user_id)} disabled={removing === r.member_user_id}>
                          {removing === r.member_user_id ? "Removing..." : "Remove"}
                        </Button>
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
  )
}


