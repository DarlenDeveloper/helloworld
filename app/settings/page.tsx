"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload, Palette, Key, Clock, Trash2 } from "lucide-react"

// Types
interface ProfileRow {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
}

type OrgRole = "admin" | "manager" | "agent" | "viewer"

interface TwoFactorMeta {
  enabled?: boolean
  verified?: boolean
  secret?: string
}

interface OrganizationMember {
  organization_id: string
  user_id: string
  role: OrgRole
  created_at: string
}

interface OrganizationRow {
  id: string
  name: string
}

interface AccountEmailRow {
  id: string
  organization_id: string
  user_id: string
  email: string
  is_primary: boolean
  created_at: string
}

interface MemberView {
  user_id: string
  role: OrgRole
  created_at: string
  name: string
  email: string
}

export default function SettingsPage() {
  const supabase = createClient()

  // Auth/profile/meta
  const [uid, setUid] = useState<string | null>(null)
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  const [selectedTimezone, setSelectedTimezone] = useState("UTC+3 (East Africa Time)")
  const [twoFactorMeta, setTwoFactorMeta] = useState<TwoFactorMeta>({})
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [twoFactorCode, setTwoFactorCode] = useState("")

  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [brandingURL, setBrandingURL] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const [loading, setLoading] = useState(true)
  const [savingTimezone, setSavingTimezone] = useState(false)
  const [savingBranding, setSavingBranding] = useState(false)
  const [verifying2FA, setVerifying2FA] = useState(false)

  // Org context
  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState("")
  const [orgRole, setOrgRole] = useState<OrgRole | null>(null)
  const isOrgAdmin = orgRole === "admin"
  const [savingOrgName, setSavingOrgName] = useState(false)

  // Account emails
  const [accountEmails, setAccountEmails] = useState<AccountEmailRow[]>([])
  const [newAccountEmail, setNewAccountEmail] = useState("")
  const [addingEmail, setAddingEmail] = useState(false)
  const [deletingEmailId, setDeletingEmailId] = useState<string | null>(null)

  // Members
  const [members, setMembers] = useState<MemberView[]>([])
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }
        setUid(user.id)
        setAuthEmail(user.email ?? null)

        const tz = (user.user_metadata?.timezone as string) || "UTC+3 (East Africa Time)"
        setSelectedTimezone(tz)

        const tfm: TwoFactorMeta = user.user_metadata?.two_factor || {}
        setTwoFactorMeta(tfm)
        setTwoFactorEnabled(Boolean(tfm.enabled))

        const { data: prof } = await supabase
          .from("profiles")
          .select("id, email, full_name, avatar_url")
          .eq("id", user.id)
          .single()
        if (prof) {
          const p = prof as ProfileRow
          setProfile(p)
          setBrandingURL(p.avatar_url || null)
        }

        await loadOrganizationContext(user.id)
      } finally {
        setLoading(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  const loadOrganizationContext = async (userId: string) => {
    // membership
    const { data: membershipRows, error: memErr } = await supabase
      .from("organization_members")
      .select("organization_id, user_id, role, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
    if (memErr) {
      console.error(memErr)
      return
    }
    const membership = (membershipRows || [])[0] as OrganizationMember | undefined
    if (!membership) return

    setOrgId(membership.organization_id)
    setOrgRole(membership.role)

    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", membership.organization_id)
      .single()
    if (!orgErr && org) setOrgName((org as OrganizationRow).name)

    await Promise.all([
      fetchAccountEmails(membership.organization_id),
      fetchMembers(membership.organization_id),
    ])
  }

  const fetchAccountEmails = async (organizationId: string) => {
    const { data, error } = await supabase
      .from("account_emails")
      .select("id, organization_id, user_id, email, is_primary, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
    if (error) {
      console.error(error)
      return
    }
    setAccountEmails((data as AccountEmailRow[]) || [])
  }

  const fetchMembers = async (organizationId: string) => {
    const { data: mRows, error: mErr } = await supabase
      .from("organization_members")
      .select("user_id, role, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
    if (mErr) {
      console.error(mErr)
      return
    }
    const rows = (mRows as OrganizationMember[]) || []
    const ids = rows.map((r) => r.user_id)
    if (ids.length === 0) {
      setMembers([])
      return
    }
    const { data: profs, error: pErr } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids)
    if (pErr) {
      console.error(pErr)
      setMembers([])
      return
    }
    const profMap = new Map<string, { full_name: string | null; email: string | null }>()
    ;(profs || []).forEach((p: any) => {
      profMap.set(p.id, { full_name: p.full_name, email: p.email })
    })
    const merged: MemberView[] = rows.map((r) => ({
      user_id: r.user_id,
      role: r.role,
      created_at: r.created_at,
      name: profMap.get(r.user_id)?.full_name || "-",
      email: profMap.get(r.user_id)?.email || "-",
    }))
    setMembers(merged)
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setLogoFile(f)
  }

  const saveTimezone = async () => {
    if (!uid) return
    setSavingTimezone(true)
    try {
      await supabase.auth.updateUser({ data: { timezone: selectedTimezone } })
    } finally {
      setSavingTimezone(false)
    }
  }

  const saveBranding = async () => {
    if (!uid || !logoFile) return
    setSavingBranding(true)
    try {
      const bucket = "branding"
      const path = `${uid}/${Date.now()}-${logoFile.name}`
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, logoFile, {
        upsert: true,
        contentType: logoFile.type,
      })
      if (upErr) throw upErr
      const { data: pub } = await supabase.storage.from(bucket).getPublicUrl(path)
      const publicUrl = pub?.publicUrl
      if (!publicUrl) throw new Error("No public URL")
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", uid)
      if (updErr) throw updErr
      setBrandingURL(publicUrl)
      setLogoFile(null)
    } catch (e) {
      console.error(e)
    } finally {
      setSavingBranding(false)
    }
  }

  const toggleTwoFactor = async (checked: boolean) => {
    if (!uid) return
    try {
      if (checked) {
        let secret = twoFactorMeta.secret
        if (!secret) secret = generateBase32Secret(20)
        const updated: TwoFactorMeta = { enabled: true, verified: false, secret }
        await supabase.auth.updateUser({ data: { two_factor: updated } })
        setTwoFactorMeta(updated)
        setTwoFactorEnabled(true)
      } else {
        const updated: TwoFactorMeta = { enabled: false, verified: false, secret: twoFactorMeta.secret }
        await supabase.auth.updateUser({ data: { two_factor: updated } })
        setTwoFactorMeta(updated)
        setTwoFactorEnabled(false)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const otpauthURL = useMemo(() => {
    if (!authEmail || !twoFactorMeta.secret) return ""
    const issuer = encodeURIComponent("AIRIES AI CRM")
    const account = encodeURIComponent(authEmail)
    return `otpauth://totp/${issuer}:${account}?secret=${twoFactorMeta.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`
  }, [authEmail, twoFactorMeta.secret])

  const verifyTwoFactor = async () => {
    if (!uid || !twoFactorMeta.secret) return
    setVerifying2FA(true)
    try {
      const ok = await verifyTOTP(twoFactorMeta.secret, twoFactorCode)
      if (ok) {
        const updated: TwoFactorMeta = { ...twoFactorMeta, verified: true }
        await supabase.auth.updateUser({ data: { two_factor: updated } })
        setTwoFactorMeta(updated)
        setTwoFactorCode("")
      }
    } finally {
        setVerifying2FA(false)
    }
  }

  const saveOrganizationName = async () => {
    if (!orgId || !isOrgAdmin) return
    setSavingOrgName(true)
    try {
      const { error } = await supabase.from("organizations").update({ name: orgName }).eq("id", orgId)
      if (error) throw error
    } catch (e) {
      console.error(e)
    } finally {
      setSavingOrgName(false)
    }
  }

  const addOrgAccountEmail = async () => {
    if (!uid || !newAccountEmail.trim()) return
    setAddingEmail(true)
    try {
      const { error } = await supabase.rpc("add_account_email", { p_user_id: uid, p_email: newAccountEmail.trim() })
      if (error) throw error
      if (orgId) await fetchAccountEmails(orgId)
      setNewAccountEmail("")
    } catch (e) {
      console.error(e)
    } finally {
      setAddingEmail(false)
    }
  }

  const deleteOrgAccountEmail = async (id: string) => {
    if (!orgId) return
    setDeletingEmailId(id)
    try {
      const { error } = await supabase.from("account_emails").delete().eq("id", id)
      if (error) throw error
      await fetchAccountEmails(orgId)
    } catch (e) {
      console.error(e)
    } finally {
      setDeletingEmailId(null)
    }
  }

  const updateMemberRole = async (userId: string, newRole: OrgRole) => {
    if (!isOrgAdmin || !orgId) return
    setUpdatingMemberId(userId)
    try {
      const { error } = await supabase
        .from("organization_members")
        .update({ role: newRole })
        .eq("organization_id", orgId)
        .eq("user_id", userId)
      if (error) throw error
      await fetchMembers(orgId)
    } catch (e) {
      console.error(e)
    } finally {
      setUpdatingMemberId(null)
    }
  }

  const removeMember = async (userId: string) => {
    if (!isOrgAdmin || !orgId) return
    setRemovingMemberId(userId)
    try {
      const { error } = await supabase
        .from("organization_members")
        .delete()
        .eq("organization_id", orgId)
        .eq("user_id", userId)
      if (error) throw error
      await fetchMembers(orgId)
    } catch (e) {
      console.error(e)
    } finally {
      setRemovingMemberId(null)
    }
  }

  if (loading) {
    return (
      <div className="ml-20 p-6 flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="ml-20 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-black">Settings</h1>
          <p className="text-gray-600 mt-2">Manage system configuration, organization, and security</p>
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="general">General Settings</TabsTrigger>
            <TabsTrigger value="customization">Customization</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          {/* User Management: real org members */}
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Organization Members</CardTitle>
                <CardDescription>Members of your organization</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-gray-500">No members found.</TableCell>
                      </TableRow>
                    ) : (
                      members.map((m) => (
                        <TableRow key={m.user_id}>
                          <TableCell className="font-medium">{m.name}</TableCell>
                          <TableCell>{m.email}</TableCell>
                          <TableCell>
                            {isOrgAdmin ? (
                              <Select
                                value={m.role}
                                onValueChange={(v) => updateMemberRole(m.user_id, v as OrgRole)}
                                disabled={updatingMemberId === m.user_id}
                              >
                                <SelectTrigger className="w-40">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">admin</SelectItem>
                                  <SelectItem value="manager">manager</SelectItem>
                                  <SelectItem value="agent">agent</SelectItem>
                                  <SelectItem value="viewer">viewer</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline">{m.role}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{new Date(m.created_at).toLocaleString()}</TableCell>
                          <TableCell>
                            {isOrgAdmin && m.user_id !== uid && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600"
                                onClick={() => removeMember(m.user_id)}
                                disabled={removingMemberId === m.user_id}
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                {removingMemberId === m.user_id ? "Removing..." : "Remove"}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* General Settings: timezone + organization */}
          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Time Zone Settings
                </CardTitle>
                <CardDescription>Configure system time zone preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="timezone">Default Time Zone</Label>
                  <Select value={selectedTimezone} onValueChange={setSelectedTimezone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC+3 (East Africa Time)">UTC+3 (East Africa Time)</SelectItem>
                      <SelectItem value="UTC+0 (GMT)">UTC+0 (GMT)</SelectItem>
                      <SelectItem value="UTC-5 (EST)">UTC-5 (EST)</SelectItem>
                      <SelectItem value="UTC-8 (PST)">UTC-8 (PST)</SelectItem>
                      <SelectItem value="UTC+1 (CET)">UTC+1 (CET)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={saveTimezone} disabled={savingTimezone} className="bg-teal-500 hover:bg-teal-600">
                  {savingTimezone ? "Saving..." : "Save Time Zone"}
                </Button>
            </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Organization</CardTitle>
                <CardDescription>Manage your organization details and account emails</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="org-name">Organization Name</Label>
                    <Input id="org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} disabled={!isOrgAdmin} />
                    <div className="text-xs text-gray-500 mt-1">Role: {orgRole || "-"}</div>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={saveOrganizationName} disabled={!isOrgAdmin || savingOrgName}>
                      {savingOrgName ? "Saving..." : "Save Organization"}
                    </Button>
                  </div>
                </div>

                <div>
                  <Label>Account Emails</Label>
                  <div className="mt-2 space-y-3">
                    <div className="flex gap-2 max-w-lg">
                      <Input
                        placeholder="Add additional account email"
                        value={newAccountEmail}
                        onChange={(e) => setNewAccountEmail(e.target.value)}
                        type="email"
                      />
                      <Button onClick={addOrgAccountEmail} disabled={addingEmail || !newAccountEmail.trim()}>
                        {addingEmail ? "Adding..." : "Add"}
                      </Button>
                    </div>
                    <div className="border rounded-lg divide-y">
                      {accountEmails.length === 0 ? (
                        <div className="p-3 text-sm text-gray-500">No emails found.</div>
                      ) : (
                        accountEmails.map((ae) => (
                          <div key={ae.id} className="p-3 flex items-center justify-between">
                            <div>
                              <div className="text-sm text-black">{ae.email}</div>
                              <div className="text-xs text-gray-500">{ae.is_primary ? "Primary email" : "Secondary email"}</div>
                            </div>
                            <div>
                              {!ae.is_primary && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600"
                                  onClick={() => deleteOrgAccountEmail(ae.id)}
                                  disabled={deletingEmailId === ae.id}
                                >
                                  {deletingEmailId === ae.id ? "Removing..." : "Remove"}
                                </Button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {isOrgAdmin && (
                  <div>
                    <Label>Invite Employees</Label>
                    <InviteEmployees orgId={orgId} onChanged={async () => { if (orgId) { await fetchMembers(orgId) } }} />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Customization */}
          <TabsContent value="customization" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Company Branding
                </CardTitle>
                <CardDescription>Customize your company's appearance in the system</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="logo">Company Logo</Label>
                  <div className="mt-2 flex items-center gap-4">
                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {logoFile ? (
                        <img src={URL.createObjectURL(logoFile)} alt="Logo preview" className="w-full h-full object-cover rounded-lg" />
                      ) : brandingURL ? (
                        <img src={brandingURL} alt="Logo" className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <Upload className="h-6 w-6 text-gray-400" />
                      )}
                    </div>
                    <div>
                      <input type="file" id="logo" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      <Button variant="outline" onClick={() => document.getElementById("logo")?.click()}>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Logo
                      </Button>
                      <p className="text-sm text-gray-500 mt-1">Recommended: 64x64px, PNG or JPG</p>
                    </div>
                  </div>
                </div>
                <Button onClick={saveBranding} disabled={savingBranding || !logoFile} className="bg-teal-500 hover:bg-teal-600">
                  {savingBranding ? "Saving..." : "Save Branding"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Two-Factor Authentication
                </CardTitle>
                <CardDescription>Enhance security with Google Authenticator</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="2fa">Enable Two-Factor Authentication</Label>
                    <p className="text-sm text-gray-500">Require authentication codes from Google Authenticator</p>
                  </div>
                  <Switch id="2fa" checked={twoFactorEnabled} onCheckedChange={toggleTwoFactor} />
                </div>
                {twoFactorEnabled && (
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <h4 className="font-medium mb-2">Setup Instructions</h4>
                    <ol className="text-sm space-y-1 list-decimal list-inside">
                      <li>Download Google Authenticator app</li>
                      <li>Scan the QR code below (or add key manually)</li>
                      <li>Enter the 6-digit code to verify</li>
                    </ol>
                    <div className="mt-4 p-4 bg-white border rounded text-center">
                      <div className="w-32 h-32 bg-gray-200 mx-auto mb-2 flex items-center justify-center">QR Code</div>
                      <div className="text-xs text-gray-600 break-all mb-2">{otpauthURL}</div>
                      <Input placeholder="Enter verification code" className="max-w-48 mx-auto" value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} />
                      <Button className="mt-2 bg-teal-500 hover:bg-teal-600" onClick={verifyTwoFactor} disabled={verifying2FA}>
                        {twoFactorMeta.verified ? "Verified" : verifying2FA ? "Verifying..." : "Verify"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function InviteEmployees({ orgId, onChanged }: { orgId: string | null, onChanged: () => void }) {
  const supabase = createClient()
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "manager" | "agent" | "viewer">("agent")
  const [inviting, setInviting] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [invites, setInvites] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      if (!orgId) return
      const { data } = await supabase
        .from("organization_invites")
        .select("id, email, role, status, created_at, accepted_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
      setInvites(data || [])
    }
    load()
  }, [supabase, orgId])

  const invite = async () => {
    if (!orgId || !inviteEmail.trim()) return
    setInviting(true)
    try {
      const { error } = await supabase.rpc("invite_org_email", {
        p_org: orgId,
        p_email: inviteEmail.trim(),
        p_role: inviteRole,
        p_invited_by: null,
      })
      if (error) throw error
      setInviteEmail("")
      // Refresh
      const { data } = await supabase
        .from("organization_invites")
        .select("id, email, role, status, created_at, accepted_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
      setInvites(data || [])
      onChanged()
    } catch (e) {
      console.error(e)
    } finally {
      setInviting(false)
    }
  }

  const revoke = async (id: string) => {
    if (!orgId) return
    setRevokingId(id)
    try {
      const { error } = await supabase
        .from("organization_invites")
        .update({ status: "revoked" })
        .eq("id", id)
      if (error) throw error
      setInvites((prev) => prev.map((i) => (i.id === id ? { ...i, status: "revoked" } : i)))
    } catch (e) {
      console.error(e)
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <Card className="mt-2">
      <CardHeader>
        <CardTitle className="text-base">Invite Employees</CardTitle>
        <CardDescription>Send email-based invites. Upon signup, invited users join your org automatically.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 max-w-xl">
          <Input
            placeholder="employee@example.com"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as any)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">admin</SelectItem>
              <SelectItem value="manager">manager</SelectItem>
              <SelectItem value="agent">agent</SelectItem>
              <SelectItem value="viewer">viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={invite} disabled={inviting || !inviteEmail.trim()}>
            {inviting ? "Sending..." : "Send Invite"}
          </Button>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium mb-2">Pending / Recent Invites</div>
          <div className="border rounded-lg divide-y">
            {invites.length === 0 ? (
              <div className="p-3 text-sm text-gray-500">No invites yet.</div>
            ) : (
              invites.map((i) => (
                <div key={i.id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-black">{i.email}</div>
                    <div className="text-xs text-gray-500">Role: {i.role} • Status: {i.status}</div>
                  </div>
                  <div>
                    {i.status === "pending" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600"
                        onClick={() => revoke(i.id)}
                        disabled={revokingId === i.id}
                      >
                        {revokingId === i.id ? "Revoking..." : "Revoke"}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Utilities: Base32/TOTP
function generateBase32Secret(length = 20) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  const bytes = new Uint8Array(length)
  if (typeof window !== "undefined" && window.crypto) window.crypto.getRandomValues(bytes)
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
  let out = ""
  for (let i = 0; i < bytes.length; i += 5) {
    const chunk = [bytes[i], bytes[i + 1] || 0, bytes[i + 2] || 0, bytes[i + 3] || 0, bytes[i + 4] || 0]
    const bits = (chunk[0] << 32) + (chunk[1] << 24) + (chunk[2] << 16) + (chunk[3] << 8) + chunk[4]
    const c = [
      (bits >>> 35) & 31,
      (bits >>> 30) & 31,
      (bits >>> 25) & 31,
      (bits >>> 20) & 31,
      (bits >>> 15) & 31,
      (bits >>> 10) & 31,
      (bits >>> 5) & 31,
      bits & 31,
    ]
    for (let j = 0; j < 8; j++) out += alphabet[c[j]]
  }
  return out.slice(0, Math.ceil((length * 8) / 5))
}

function base32Decode(input: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  const clean = input.replace(/=+$/, "").toUpperCase().replace(/[^A-Z2-7]/g, "")
  let bits = ""
  for (const ch of clean) {
    const val = alphabet.indexOf(ch)
    if (val === -1) continue
    bits += val.toString(2).padStart(5, "0")
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.substring(i, i + 8), 2))
  return new Uint8Array(bytes)
}

async function hmacSha1(keyBytes: Uint8Array, msgBytes: Uint8Array) {
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, msgBytes)
  return new Uint8Array(sig)
}

async function hotp(secretBase32: string, counter: number, digits = 6) {
  const key = base32Decode(secretBase32)
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  const high = Math.floor(counter / 0x100000000)
  const low = counter & 0xffffffff
  view.setUint32(0, high)
  view.setUint32(4, low)
  const hmac = await hmacSha1(key, new Uint8Array(buf))
  const offset = hmac[hmac.length - 1] & 0x0f
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  return (code % 10 ** digits).toString().padStart(digits, "0")
}

async function totp(secretBase32: string, timeStep = 30, digits = 6) {
  const counter = Math.floor(Date.now() / 1000 / timeStep)
  return hotp(secretBase32, counter, digits)
}

async function verifyTOTP(secretBase32: string, code: string, window = 1) {
  const counter = Math.floor(Date.now() / 1000 / 30)
  const candidates = []
  for (let w = -window; w <= window; w++) candidates.push(hotp(secretBase32, counter + w, 6))
  const results = await Promise.all(candidates)
  return results.includes(code)
}
