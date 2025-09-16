"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"

import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  TableFooter,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { Alert } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"

import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { type BatchSummary, type ListParams } from "@/lib/api/batches"
import { createClient } from "@/lib/supabase/client"

/* ===========================
   Utilities
   =========================== */

function useQuerySync() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setQuery = React.useCallback(
    (updates: Record<string, string | null | undefined>, replace = true) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === "") {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }
      const qs = params.toString()
      const url = qs ? `${pathname}?${qs}` : pathname
      if (replace) router.replace(url)
      else router.push(url)
    },
    [router, pathname, searchParams]
  )

  return { searchParams, setQuery }
}

function toInt(v: string | null, fallback: number): number {
  const n = v ? parseInt(v, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function fmtDate(iso?: string) {
  if (!iso) return "-"
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  } catch {
    return iso
  }
}

// Looser "acceptable" phone check for red-flagging only (not enforced).
// Acceptable (but not enforced for dispatch): +countrycode followed by at least 9 digits (total 10+ digits).
const CC_PLUS_9_REGEX = /^\+\d{10,}$/

// Basic loose normalization: strip separators, 00->+, add + if only digits and length >= 10.
// We DO NOT enforce validity here; red flags are purely visual and nothing is suppressed.
function normalizeLoosePhone(raw: string): string {
  let s = (raw || "").trim()
  s = s.replace(/[\s\-().]/g, "")
  if (s.startsWith("00")) s = "+" + s.slice(2)
  if (!s.startsWith("+") && /^\d{10,}$/.test(s)) s = "+" + s
  return s
}

/* ===========================
   Data helpers (Supabase)
   =========================== */

type SupabaseClientLike = ReturnType<typeof createClient>

/** Count snapshot contacts for a batch from batch_contacts to avoid stale contact_count */
async function countContactsForBatch(supabase: SupabaseClientLike, batchId: string): Promise<number> {
  const { count, error } = await supabase
    .from("batch_contacts")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
  if (error) {
    console.error("countContactsForBatch error", error)
    return 0
  }
  return Number(count ?? 0)
}

/** Get last session totals.enqueued for a batch (used for progress) */
async function getLastSessionEnqueued(supabase: SupabaseClientLike, batchId: string): Promise<number> {
  const { data, error } = await supabase
    .from("call_scheduling_sessions")
    .select("totals,created_at")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: false })
    .limit(1)
  if (error) {
    console.error("getLastSessionEnqueued error", error)
    return 0
  }
  const totals = (data?.[0]?.totals || {}) as any
  return Number(totals?.enqueued ?? 0)
}

/* ===========================
   Status Badge
   =========================== */

const STATUS_CLASS: Record<string, string> = {
  queued: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  running: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  canceled: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  draft: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
}

export function StatusBadge({ status }: { status: string }) {
  const cls =
    STATUS_CLASS[status?.toLowerCase?.() ?? ""] ??
    "bg-muted text-foreground/80 dark:bg-muted/40"
  return (
    <Badge
      className={cn(
        "px-2 py-0.5 font-medium rounded-full capitalize",
        cls
      )}
      aria-label={`status ${status}`}
    >
      {status || "-"}
    </Badge>
  )
}

/* ===========================
   Toolbar (Search / Filters / Sort / Page size)
   =========================== */

const STATUS_FILTERS = [
  { key: "", label: "All" },
  { key: "queued", label: "Queued" },
  { key: "running", label: "Running" },
  { key: "paused", label: "Paused" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
]

const SORT_OPTIONS = [
  { key: "created_desc", label: "Created (newest)" },
  { key: "created_asc", label: "Created (oldest)" },
  { key: "name_asc", label: "Name (A–Z)" },
  { key: "name_desc", label: "Name (Z–A)" },
  { key: "status_asc", label: "Status" },
]

const PAGE_SIZES = [10, 25, 50, 100]

export function BatchesToolbar() {
  const { searchParams, setQuery } = useQuerySync()
  const [q, setQ] = React.useState(searchParams?.get("q") ?? "")
  const status = searchParams?.get("status") ?? ""
  const sort = searchParams?.get("sort") ?? "created_desc"
  const pageSize = toInt(searchParams?.get("pageSize"), 25)

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => {
      setQuery({ q, page: "1" }, true)
    }, 300)
    return () => clearTimeout(t)
  }, [q, setQuery])

  // Keep input in sync if changed externally
  React.useEffect(() => {
    setQ(searchParams?.get("q") ?? "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams?.get("q")])

  return (
    <div
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      role="region"
      aria-label="Batches toolbar"
    >
      <div className="flex flex-1 items-center gap-2">
        <label htmlFor="batch-search" className="sr-only">
          Search batches
        </label>
        <Input
          id="batch-search"
          inputMode="search"
          placeholder="Search batches…"
          className="w-full sm:max-w-sm"
          value={q}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
          aria-label="Search batches"
        />

        <div className="hidden md:flex items-center gap-1">
          {STATUS_FILTERS.map((s) => {
            const selected = (status || "") === s.key
            return (
              <Button
                key={s.key || "all"}
                variant="outline"
                className={cn(
                  "h-9 px-3",
                  selected
                    ? "bg-neutral-900 text-white dark:bg-neutral-900 dark:text-white border-neutral-900 hover:bg-neutral-900/90"
                    : ""
                )}
                aria-pressed={selected}
                onClick={() =>
                  setQuery(
                    { status: s.key || null, page: "1" },
                    true
                  )
                }
              >
                {s.label}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={sort}
          onValueChange={(v: string) => setQuery({ sort: v, page: "1" })}
        >
          <SelectTrigger
            className="w-[180px]"
            aria-label="Sort batches"
          >
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(pageSize)}
          onValueChange={(v: string) => setQuery({ pageSize: v, page: "1" })}
        >
          <SelectTrigger
            className="w-[120px]"
            aria-label="Rows per page"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button asChild className="ml-1 bg-neutral-900 text-white hover:bg-neutral-900/90">
          <Link href="/batches/new" aria-label="Create new batch">
            New Batch
          </Link>
        </Button>
      </div>

      {/* Mobile status filter */}
      <div className="md:hidden -mt-2">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => {
            const selected = (status || "") === s.key
            return (
              <Button
                key={s.key || "all"}
                size="sm"
                variant="outline"
                className={cn(
                  "h-8 px-2 rounded-full",
                  selected
                    ? "bg-neutral-900 text-white dark:bg-neutral-900 dark:text-white border-neutral-900 hover:bg-neutral-900/90"
                    : ""
                )}
                aria-pressed={selected}
                onClick={() =>
                  setQuery(
                    { status: s.key || null, page: "1" },
                    true
                  )
                }
              >
                {s.label}
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ===========================
   Pagination
   =========================== */

export function PaginationBar({
  total,
  page,
  pageSize,
}: {
  total: number
  page: number
  pageSize: number
}) {
  const { setQuery } = useQuerySync()
  const pageCount = Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(total, page * pageSize)

  return (
    <div
      className="flex items-center justify-between gap-3 py-2"
      role="navigation"
      aria-label="Pagination"
    >
      <div className="text-sm text-muted-foreground">
        {total > 0 ? (
          <>Showing {start}–{end} of {total}</>
        ) : (
          <>No results</>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setQuery({ page: String(Math.max(1, page - 1)) })}
          aria-label="Previous page"
        >
          Previous
        </Button>
        <span className="text-sm min-w-[4ch] text-center" aria-live="polite">
          {page} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => setQuery({ page: String(Math.min(pageCount, page + 1)) })}
          aria-label="Next page"
        >
          Next
        </Button>
      </div>
    </div>
  )
}

/* ===========================
   Error & Empty & Skeleton
   =========================== */

export function ErrorAlert({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <Alert className="border-destructive/50">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          {message || "Something went wrong."}
        </p>
        {onRetry && (
          <Button size="sm" variant="destructive" onClick={onRetry} aria-label="Retry">
            Retry
          </Button>
        )}
      </div>
    </Alert>
  )
}

export function EmptyState({
  title,
  description,
  actionHref,
  actionText,
}: {
  title: string
  description?: string
  actionHref?: string
  actionText?: string
}) {
  return (
    <Card className="p-6 text-center">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && (
          <p className="text-muted-foreground">{description}</p>
        )}
        {actionHref && actionText && (
          <Button asChild className="mt-2 bg-neutral-900 text-white hover:bg-neutral-900/90">
            <Link href={actionHref}>{actionText}</Link>
          </Button>
        )}
      </div>
    </Card>
  )
}

export function RowSkeleton() {
  return (
    <TableRow>
      <TableCell className="w-[28%]">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
      </TableCell>
      <TableCell className="w-[10%]">
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
      </TableCell>
      <TableCell className="w-[12%]">
        <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
      </TableCell>
      <TableCell className="w-[18%]">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </TableCell>
      <TableCell className="w-[10%]">
        <div className="h-4 w-10 animate-pulse rounded bg-muted" />
      </TableCell>
      <TableCell className="w-[12%]">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </TableCell>
      <TableCell className="w-[10%]">
        <div className="h-6 w-10 animate-pulse rounded bg-muted" />
      </TableCell>
    </TableRow>
  )
}

/* ===========================
   Table (List)
   =========================== */

export function BatchesTable({
  items,
  onView,
  onToggleStatus,
  onDelete,
  onCallBatch,
}: {
  items: BatchSummary[]
  onView: (id: string) => void
  onToggleStatus: (row: BatchSummary) => Promise<void>
  onDelete: (row: BatchSummary) => Promise<void>
  onCallBatch: (row: BatchSummary) => Promise<void>
}) {
  return (
    <Table className="min-w-[720px]">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[28%]">Name</TableHead>
          <TableHead className="w-[10%]">Type</TableHead>
          <TableHead className="w-[12%]">Status</TableHead>
          <TableHead className="w-[18%]">Created</TableHead>
          <TableHead className="w-[10%]">Items</TableHead>
          <TableHead className="w-[12%]">Progress</TableHead>
          <TableHead className="w-[10%] text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <button
                className="text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 ring-offset-2 rounded"
                onClick={() => onView(row.id)}
                aria-label={`View details for ${row.name}`}
              >
                {row.name}
              </button>
            </TableCell>
            <TableCell className="capitalize">{row.type}</TableCell>
            <TableCell>
              <StatusBadge status={row.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {fmtDate(row.createdAt)}
            </TableCell>
            <TableCell>
              {row.itemsProcessed}/{row.itemsTotal}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Progress value={row.progressPct} className="h-2 w-24" />
                <span className="text-xs text-muted-foreground w-8 tabular-nums">
                  {row.progressPct}%
                </span>
              </div>
            </TableCell>
            <TableCell className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" aria-label="Row actions">
                    Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(row.id)}>
                    View details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onCallBatch(row)}>
                    Call batch
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onToggleStatus(row)}>
                    {row.status === "paused" ? "Resume" : "Pause"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(row)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/* ===========================
   List View Client
   =========================== */

export function BatchesListClient() {
  const { searchParams } = useQuerySync()
  const router = useRouter()

  const params = React.useMemo<ListParams>(() => {
    return {
      page: toInt(searchParams?.get("page"), 1),
      pageSize: toInt(searchParams?.get("pageSize"), 25),
      q: searchParams?.get("q") ?? undefined,
      status: searchParams?.get("status") ?? undefined,
      sort: searchParams?.get("sort") ?? "created_desc",
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams?.toString()])

  const [rows, setRows] = React.useState<BatchSummary[] | null>(null)
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [nonce, setNonce] = React.useState(0)
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const [adminOwners, setAdminOwners] = React.useState<Set<string>>(new Set())

  // Permission helper: can current user edit the given row (owner or editor collaborator)?
  const canEditRow = React.useCallback((row: BatchSummary) => {
    const ownerId = String((((row as any)?.raw as any)?.user_id) ?? "")
    if (!ownerId) return false
    if (currentUserId && ownerId === currentUserId) return true
    return adminOwners.has(ownerId)
  }, [currentUserId, adminOwners])

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr) throw authErr
      if (!user) {
        setError("Not authenticated")
        setRows([])
        setTotal(0)
        setLoading(false)
        return
      }

      // Fetch batches (RLS will return owned + collaborator-shared)
      let { data, error } = await supabase
        .from("contact_batches")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error

      // Resolve my editor permissions (owners for whom I'm an 'editor')
      setCurrentUserId(user.id)
      const { data: memberships } = await supabase
        .from("account_users")
        .select("owner_user_id, member_user_id, role, is_active")
        .eq("member_user_id", user.id)
        .eq("is_active", true)
      const adminSet = new Set<string>()
      ;(memberships || []).forEach((m: any) => {
        if (String(m.role || "").toLowerCase() === "admin") adminSet.add((m as any).owner_user_id)
      })
      setAdminOwners(adminSet)

      let arr = (data || []) as any[]

      // Client-side search by name
      if (params.q) {
        const ql = params.q.toLowerCase()
        arr = arr.filter((r) => (r.name || "").toLowerCase().includes(ql))
      }

      const page = params.page ?? 1
      const pageSize = params.pageSize ?? 25
      const totalCount = arr.length
      const start = (page - 1) * pageSize
      const paged = arr.slice(start, start + pageSize)

      // Enrich each batch with live contact count and last enqueued for progress
      const enriched = await Promise.all(
        paged.map(async (b: any) => {
          const id = String(b.id)
          const liveCount = await countContactsForBatch(supabase, id)
          const itemsTotal = liveCount > 0 ? liveCount : Number(b.contact_count ?? 0)
          const enqueued = await getLastSessionEnqueued(supabase, id)
          const progressPct =
            itemsTotal > 0 ? Math.min(100, Math.round((enqueued / itemsTotal) * 100)) : 0

          const row: BatchSummary = {
            id,
            name: String(b.name ?? `Batch ${id.slice(0, 8)}`),
            type: "call",
            status: "queued",
            createdAt: b.created_at,
            itemsTotal,
            itemsProcessed: enqueued,
            progressPct,
            raw: b,
          }
          return row
        })
      )

      setRows(enriched)
      setTotal(totalCount)
    } catch (e: any) {
      setError(e?.message || "Failed to load batches")
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [params])

  React.useEffect(() => {
    void load()
  }, [load, nonce])

  const onRetry = React.useCallback(() => {
    setNonce((n) => n + 1)
  }, [])

  const onView = React.useCallback(
    (id: string) => {
      router.push(`/batches/${encodeURIComponent(id)}`)
    },
    [router]
  )

  const onToggleStatus = React.useCallback(async (row: BatchSummary) => {
    if (!canEditRow(row)) {
      alert("Insufficient permission: admin required for this batch.")
      return
    }
    const nextStatus =
      row.status === "paused" ? "running" : row.status === "running" ? "paused" : row.status

    // UI-only toggle to avoid backend schema changes
    setRows((prev) =>
      (prev ?? []).map((r) =>
        r.id === row.id ? { ...r, status: nextStatus } : r
      )
    )
  }, [canEditRow])

  const onDelete = React.useCallback(async (row: BatchSummary) => {
    if (!confirm(`Delete batch "${row.name}"? This cannot be undone.`)) return
    if (!canEditRow(row)) {
      alert("Insufficient permission: admin required for this batch.")
      return
    }
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("contact_batches")
        .delete()
        .eq("id", row.id)
      if (error) throw error

      setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error("Delete failed", err)
    }
  }, [canEditRow])

  const onCallBatch = React.useCallback(async (row: BatchSummary) => {
    if (!canEditRow(row)) {
      alert("Insufficient permission: admin required for this batch.")
      return
    }
    try {
      let totalEnqueued = 0
      let totalErrored = 0
      const maxLoops = 1000
      for (let i = 0; i < maxLoops; i++) {
        const res = await fetch("/api/scheduling/call/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch_id: row.id }),
        })
        let j: any = {}
        try {
          j = await res.json()
        } catch {}
        if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`)
        const enq = Number(j?.totals?.enqueued ?? 0)
        const err = Number(j?.totals?.errored ?? 0)
        totalEnqueued += enq
        totalErrored += err
        if (enq === 0) break
        await new Promise((r) => setTimeout(r, 500))
      }
      alert(`Call batch completed. Enqueued=${totalEnqueued}, Failed=${totalErrored}`)
      setNonce((n) => n + 1)
    } catch (e: any) {
      alert(e?.message || "Failed to call batch")
    }
  }, [canEditRow])

  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 25

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Batches</h1>
            <Badge
              variant="outline"
              className="uppercase tracking-wide text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800"
            >
              Beta
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage and monitor batch executions.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <Button asChild className="bg-neutral-900 text-white hover:bg-neutral-900/90">
            <Link href="/batches/new">New Batch</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/users">Add Secondary User</Link>
          </Button>
        </div>
      </div>

      <BatchesToolbar />

      <div className="rounded-lg border">
        {loading ? (
          <div className="w-full overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <RowSkeleton key={i} />
                ))}
              </TableBody>
            </Table>
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorAlert message={error} onRetry={onRetry} />
          </div>
        ) : (rows?.length ?? 0) === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No batches found"
              description="Try adjusting your filters or create a new batch."
              actionHref="/batches/new"
              actionText="Create batch"
            />
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <BatchesTable
              items={rows ?? []}
              onView={onView}
              onToggleStatus={onToggleStatus}
              onDelete={onDelete}
              onCallBatch={onCallBatch}
            />
          </div>
        )}
      </div>

      <PaginationBar total={total} page={page} pageSize={pageSize} />
    </div>
  )
}

/* ===========================
   Detail View Client
   =========================== */

export function BatchDetailClient({ id }: { id: string }) {
  const router = useRouter()
  const [row, setRow] = React.useState<BatchSummary | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState("overview")
  const [canEdit, setCanEdit] = React.useState(false)

  // Manage Contacts (CSV import + Quick Add)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [importing, setImporting] = React.useState(false)
  const [importProgress, setImportProgress] = React.useState<{ processed: number; total: number } | null>(null)

  const [qaName, setQaName] = React.useState("")
  const [qaEmail, setQaEmail] = React.useState("")
  const [qaPhone, setQaPhone] = React.useState("")
  const [qaNotes, setQaNotes] = React.useState("")
  const [qaSaving, setQaSaving] = React.useState(false)
  const qaFlagged = qaPhone.trim() !== "" && !CC_PLUS_9_REGEX.test(normalizeLoosePhone(qaPhone))

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("contact_batches")
        .select("*")
        .eq("id", id)
        .single()
      if (error || !data) throw error || new Error("Not found")

      const b: any = data
      const batchId = String(b.id)
      const itemsTotal = await countContactsForBatch(supabase, batchId)
      const enqueued = await getLastSessionEnqueued(supabase, batchId)
      const progressPct =
        itemsTotal > 0 ? Math.min(100, Math.round((enqueued / itemsTotal) * 100)) : 0

      const mapped: BatchSummary = {
        id: batchId,
        name: String(b.name ?? `Batch ${batchId.slice(0, 8)}`),
        type: "call",
        status: "queued",
        createdAt: b.created_at,
        itemsTotal,
        itemsProcessed: enqueued,
        progressPct,
        raw: b,
      }
      setRow(mapped)

      // Resolve canEdit (owner or 'admin' member)
      const { data: auth } = await (supabase as any).auth.getUser?.()
      const me = auth?.user?.id || null
      let edit = false
      if (me) {
        if (me === (b as any).user_id) {
          edit = true
        } else {
          const { data: memberships } = await supabase
            .from("account_users")
            .select("role, is_active")
            .eq("owner_user_id", (b as any).user_id)
            .eq("member_user_id", me)
            .eq("is_active", true)
            .limit(1)
          const role = (memberships || [])[0]?.role?.toLowerCase?.()
          if (role === "admin") edit = true
        }
      }
      setCanEdit(edit)
    } catch (e: any) {
      setError(e?.message || "Failed to load batch")
      setRow(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    void load()
  }, [load])

  const onToggleStatus = React.useCallback(async () => {
    if (!row) return
    const nextStatus =
      row.status === "paused" ? "running" : row.status === "running" ? "paused" : row.status

    // UI-only toggle to avoid backend schema changes
    setRow((prev) => (prev ? { ...prev, status: nextStatus } : prev))
  }, [row])

  // Start Call Batch (loop until backend returns enqueued=0)
  const onStartCallBatch = React.useCallback(async () => {
    if (!row) return
    if (!canEdit) {
      alert("Insufficient permission: admin required for this batch.")
      return
    }
    try {
      let totalEnqueued = 0
      let totalErrored = 0
      const maxLoops = 1000 // safety guard
      for (let i = 0; i < maxLoops; i++) {
        const res = await fetch("/api/scheduling/call/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch_id: row.id }),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j?.error || `Failed (${res.status})`)
        const enq = Number(j?.totals?.enqueued ?? 0)
        const err = Number(j?.totals?.errored ?? 0)
        totalEnqueued += enq
        totalErrored += err
        if (enq === 0) break
        await new Promise((r) => setTimeout(r, 500))
      }
      alert(`Call batch completed. Enqueued=${totalEnqueued}, Failed=${totalErrored}`)
      await load()
    } catch (e: any) {
      alert(e?.message || "Failed to call batch")
    }
  }, [row, load, canEdit])

  // CSV parser (accepts anything; light sanitization; no skipping by format)
  const parseCSV = (text: string): { rows: { phone: string; notes: string }[] } => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return { rows: [] }
    const hasHeader = /(^|,)\s*(contact|phone|number)\s*(,|$)/i.test(lines[0])
    const entries = hasHeader ? lines.slice(1) : lines
    const rows: { phone: string; notes: string }[] = []
    for (const line of entries) {
      const parts = line.split(",")
      const rawPhone = (parts[0] || "").trim()
      if (!rawPhone) continue
      const notes = (parts[1] || "").trim()
      rows.push({ phone: normalizeLoosePhone(rawPhone), notes })
    }
    return { rows }
  }

  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const res: T[][] = []
    for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size))
    return res
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!row) return
    if (!canEdit) { alert("Insufficient permission: admin required"); return }
    const file = e.target.files?.[0]
    e.target.value = "" // reset for next time
    if (!file) return

    try {
      const text = await file.text()
      const parsed = parseCSV(text)
      const uniqueByPhone = Array.from(new Map(parsed.rows.map((r) => [r.phone, r])).values())
      if (uniqueByPhone.length === 0) {
        alert("No contacts found in CSV.")
        return
      }

      setImporting(true)
      setImportProgress({ processed: 0, total: uniqueByPhone.length })

      const supabase = createClient()
      const { data: auth } = await (supabase as any).auth.getUser?.()
      const userId = (auth?.user?.id as string) || null
      if (!userId) throw new Error("Not authenticated")

      const CHUNK_SIZE = 500
      const chunks = chunk(uniqueByPhone, CHUNK_SIZE)
      let totalInserted = 0
      let allowedRemaining = Math.max(0, 1000 - (row.itemsTotal || 0))
      if (allowedRemaining === 0) {
        alert("This batch already has 1000 contacts.")
        return
      }

      for (let i = 0; i < chunks.length && allowedRemaining > 0; i++) {
        const c = chunks[i].slice(0, allowedRemaining)

        const contactRows = c.map((r) => ({
          user_id: userId,
          name: null as string | null,
          email: null as string | null,
          phone: r.phone,
          notes: r.notes || null,
        }))

        const { data: inserted, error: insErr } = await supabase
          .from("contacts")
          .insert(contactRows)
          .select("id")

        if (insErr) {
          console.error("Failed inserting contacts chunk:", insErr)
          alert("Failed to import some contacts. See console for details.")
          break
        }

        const linkRows = (inserted || []).map((rowIns: any, idx: number) => ({
          batch_id: id,
          contact_id: rowIns.id,
          name: null as string | null,
          email: null as string | null,
          phone: c[idx]?.phone || null,
          notes: c[idx]?.notes || null,
        }))

        if (linkRows.length > 0) {
          const { error: linkErr } = await supabase.from("batch_contacts").insert(linkRows)
          if (linkErr) {
            console.error("Failed linking batch contacts:", linkErr)
            alert("Failed to link some contacts to batch. See console for details.")
            break
          }
        }

        totalInserted += contactRows.length
        setImportProgress({ processed: Math.min(totalInserted, uniqueByPhone.length), total: uniqueByPhone.length })
        allowedRemaining -= contactRows.length
      }

      if (totalInserted > 0) {
        // Refresh live count from snapshot table
        const supabase2 = createClient()
        const live = await countContactsForBatch(supabase2, id)
        setRow((prev) =>
          prev
            ? {
                ...prev,
                itemsTotal: live,
                progressPct:
                  (prev.itemsProcessed || 0) > 0 && live > 0
                    ? Math.min(100, Math.round(((prev.itemsProcessed || 0) / live) * 100))
                    : 0,
              }
            : prev
        )
      }
    } catch (err) {
      console.error("Failed to import CSV:", err)
      alert("Failed to import CSV.")
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  const quickAdd = async () => {
    if (!id) return
    if (!canEdit) { alert("Insufficient permission: admin required"); return }
    setQaSaving(true)
    try {
      const supabase = createClient()
      const { data: auth } = await (supabase as any).auth.getUser?.()
      const userId = (auth?.user?.id as string) || null
      if (!userId) throw new Error("Not authenticated")

      const normalized = normalizeLoosePhone(qaPhone)

      const { data: contactRow, error: contactErr } = await supabase
        .from("contacts")
        .insert({
          user_id: userId,
          name: qaName.trim() || null,
          email: qaEmail.trim() || null,
          phone: normalized || qaPhone.trim(),
          notes: qaNotes.trim() || null,
        })
        .select("id")
        .single()

      if (contactErr || !contactRow) throw contactErr || new Error("Failed to insert contact")

      const { error: snapshotErr } = await supabase
        .from("batch_contacts")
        .insert({
          batch_id: id,
          contact_id: (contactRow as any).id,
          name: qaName.trim() || null,
          email: qaEmail.trim() || null,
          phone: normalized || qaPhone.trim(),
          notes: qaNotes.trim() || null,
        })

      if (snapshotErr) throw snapshotErr

      // Refresh live count from snapshot table
      const live = await countContactsForBatch(supabase, id)
      setRow((prev) =>
        prev
          ? {
              ...prev,
              itemsTotal: live,
              progressPct:
                (prev.itemsProcessed || 0) > 0 && live > 0
                  ? Math.min(100, Math.round(((prev.itemsProcessed || 0) / live) * 100))
                  : 0,
            }
          : prev
      )

      setQaName("")
      setQaEmail("")
      setQaPhone("")
      setQaNotes("")
    } catch (e) {
      console.error(e)
      alert("Failed to add contact")
    } finally {
      setQaSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-muted rounded animate-pulse" />
        <div className="h-5 w-96 bg-muted rounded animate-pulse" />
        <div className="h-48 w-full bg-muted rounded animate-pulse" />
      </div>
    )
  }

  if (error || !row) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => router.push("/batches")}>
          ← Back to Batches
        </Button>
        <ErrorAlert message={error || "Not found"} onRetry={() => load()} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button
            variant="outline"
            className="mb-2"
            onClick={() => router.push("/batches")}
            aria-label="Back to list"
          >
            ← Back
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{row.name}</h1>
            <Badge
              variant="outline"
              className="uppercase tracking-wide text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800"
            >
              Beta
            </Badge>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Created {fmtDate(row.createdAt)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={row.status} />
          <Button variant="outline" onClick={onToggleStatus}>
            {row.status === "paused" ? "Resume" : "Pause"}
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/batches/${encodeURIComponent(row.id)}/edit`}>Edit</Link>
          </Button>
          <Button className="bg-neutral-900 text-white hover:bg-neutral-900/90" onClick={onStartCallBatch} disabled={!canEdit} title={!canEdit ? "Viewer role: start disabled" : undefined}>
            Start Call Batch
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Type</div>
            <div className="capitalize">{row.type || "-"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Status</div>
            <div><StatusBadge status={row.status} /></div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Processed</div>
            <div>{row.itemsProcessed} / {row.itemsTotal}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Progress</div>
            <div className="flex items-center gap-2">
              <Progress value={row.progressPct} className="h-2 w-32" />
              <span className="text-xs tabular-nums">{row.progressPct}%</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-medium">Manage Contacts</div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={!canEdit || importing} title={!canEdit ? "Viewer role: import disabled" : undefined}>
              {importing && importProgress ? `Importing ${importProgress.processed}/${importProgress.total}` : "Import CSV"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="qa-name">Name (optional)</Label>
            <Input id="qa-name" value={qaName} onChange={(e: any) => setQaName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="qa-email">Email (optional)</Label>
            <Input id="qa-email" type="email" value={qaEmail} onChange={(e: any) => setQaEmail(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="qa-phone">Phone</Label>
            <Input id="qa-phone" placeholder="e.g., +256778825312" value={qaPhone} onChange={(e: any) => setQaPhone(e.target.value)} />
            {qaFlagged && <div className="text-xs text-red-600 mt-1">This number format is flagged but will still be sent.</div>}
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="qa-notes">Notes (optional)</Label>
            <Textarea id="qa-notes" rows={3} value={qaNotes} onChange={(e: any) => setQaNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={quickAdd} disabled={!canEdit || qaSaving} title={!canEdit ? "Viewer role: add disabled" : undefined} className="bg-neutral-900 text-white hover:bg-neutral-900/90">
            {qaSaving ? "Adding..." : "Add to Batch"}
          </Button>
        </div>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">
              Overview details are limited to the available fields.
            </div>
            <div className="mt-3 text-sm">
              <pre className="bg-muted rounded p-3 overflow-auto max-h-80">
                {JSON.stringify(row.raw ?? {}, null, 2)}
              </pre>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="items">
          <Card className="p-6 text-sm text-muted-foreground">
            Items listing can be implemented here with virtualization if data is large.
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card className="p-6 text-sm text-muted-foreground">
            Activity log placeholder.
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ===========================
   Create/Edit Form Client
   =========================== */

type FormState = {
  name: string
  type: string
}

export function BatchFormClient({
  mode,
  id,
}: {
  mode: "create" | "edit"
  id?: string
}) {
  const router = useRouter()
  const [state, setState] = React.useState<FormState>({ name: "", type: "email" })
  const [loading, setLoading] = React.useState(mode === "edit")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (mode !== "edit" || !id) return
    ;(async () => {
      setLoading(true)
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("contact_batches")
          .select("*")
          .eq("id", id)
          .single()
        if (error || !data) throw error || new Error("Failed to load batch")
        setState({
          name: String((data as any).name ?? ""),
          type: "email",
        })
      } catch (e: any) {
        setError(e?.message || "Failed to load batch")
      } finally {
        setLoading(false)
      }
    })()
  }, [mode, id])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      if (mode === "create") {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error("Not authenticated")
        const { error } = await supabase
          .from("contact_batches")
          .insert({ user_id: user.id, name: state.name, description: null })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("contact_batches")
          .update({ name: state.name })
          .eq("id", id!)
        if (error) throw error
      }
      router.push("/batches")
    } catch (err: any) {
      setError(err?.message || "Save failed")
      setSaving(false)
      return
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-64 bg-muted rounded animate-pulse" />
        <div className="h-10 w-full bg-muted rounded animate-pulse" />
        <div className="h-10 w-48 bg-muted rounded animate-pulse" />
      </div>
    )
  }

  return (
    <form className="space-y-6 max-w-2xl" onSubmit={onSubmit}>
      <div>
        <h1 className="text-2xl font-semibold">
          {mode === "create" ? "Create Batch" : "Edit Batch"}
        </h1>
        <p className="text-sm text-muted-foreground">
          This form preserves server payload shapes. Only name and type are sent.
        </p>
      </div>

      {error && <ErrorAlert message={error} />}

      <div className="grid gap-4">
        <div className="grid gap-2">
          <label htmlFor="name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="name"
            required
            minLength={2}
            value={state.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setState((s) => ({ ...s, name: e.target.value }))}
          />
          <p id="name-help" className="text-xs text-muted-foreground">
            A human-readable name for the batch.
          </p>
        </div>

        <div className="grid gap-2">
          <label htmlFor="type" className="text-sm font-medium">
            Type
          </label>
          <Select
            value={state.type}
            onValueChange={(v: string) => setState((s) => ({ ...s, type: v }))}
          >
            <SelectTrigger id="type" aria-label="Batch type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="call">Call</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="push">Push</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving} className="bg-neutral-900 text-white hover:bg-neutral-900/90 disabled:opacity-60">
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/batches")}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

/* ===========================
   Barrel
   =========================== */

export const BatchesUI = {
  StatusBadge,
  BatchesToolbar,
  PaginationBar,
  ErrorAlert,
  EmptyState,
  RowSkeleton,
  BatchesTable,
  BatchesListClient,
  BatchDetailClient,
  BatchFormClient,
}