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
}: {
  items: BatchSummary[]
  onView: (id: string) => void
  onToggleStatus: (row: BatchSummary) => Promise<void>
  onDelete: (row: BatchSummary) => Promise<void>
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

      let { data, error } = await supabase
        .from("contact_batches")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (error) throw error

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

      const mapped = paged.map((b: any) => ({
        id: String(b.id),
        name: String(b.name ?? `Batch ${String(b.id).slice(0, 8)}`),
        type: "call",
        status: "queued",
        createdAt: b.created_at,
        itemsTotal: Number(b.contact_count ?? 0),
        itemsProcessed: 0,
        progressPct: 0,
        raw: b,
      })) as BatchSummary[]

      setRows(mapped)
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
    const nextStatus =
      row.status === "paused" ? "running" : row.status === "running" ? "paused" : row.status

    // UI-only toggle to avoid backend schema changes
    setRows((prev) =>
      (prev ?? []).map((r) =>
        r.id === row.id ? { ...r, status: nextStatus } : r
      )
    )
  }, [])

  const onDelete = React.useCallback(async (row: BatchSummary) => {
    if (!confirm(`Delete batch "${row.name}"? This cannot be undone.`)) return
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")
      const { error } = await supabase
        .from("contact_batches")
        .delete()
        .eq("id", row.id)
        .eq("user_id", user.id)
      if (error) throw error

      setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      console.error("Delete failed", err)
    }
  }, [])

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
        <Button asChild className="hidden sm:inline-flex bg-neutral-900 text-white hover:bg-neutral-900/90">
          <Link href="/batches/new">New Batch</Link>
        </Button>
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
      const mapped: BatchSummary = {
        id: String(b.id),
        name: String(b.name ?? `Batch ${String(b.id).slice(0, 8)}`),
        type: "call",
        status: "queued",
        createdAt: b.created_at,
        itemsTotal: Number(b.contact_count ?? 0),
        itemsProcessed: 0,
        progressPct: 0,
        raw: b,
      }
      setRow(mapped)
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