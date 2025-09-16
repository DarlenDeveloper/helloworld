/**
 * Batches API helpers (UI-only). No server code changes.
 * - Reads base URL from NEXT_PUBLIC_BATCHES_API_BASE (defaults to /api/batches)
 * - Preserves existing request/response shapes; performs client-side shaping only
 * - Never changes headers or payload schemas automatically
 */
import { getJson, postJson, patchJson, deleteJson, type ApiResult, type JsonValue } from "./client"

export const BATCHES_API_BASE = process.env.NEXT_PUBLIC_BATCHES_API_BASE || "/api/batches"

export type BatchStatus = "queued" | "running" | "paused" | "completed" | "failed" | "draft" | "canceled" | string
export type BatchType = "email" | "whatsapp" | "call" | "sms" | "push" | "unknown" | string

export type BatchSummary = {
  id: string
  name: string
  type: BatchType
  status: BatchStatus
  createdAt: string // ISO string for display; we tolerate number by converting
  itemsTotal: number
  itemsProcessed: number
  progressPct: number // 0-100 (derived)
  raw?: unknown       // original data for deep-link or debugging
}

export type ListParams = {
  page?: number
  pageSize?: number
  q?: string
  status?: string
  sort?: string
}

export type ListResponse = {
  items: unknown[]   // raw items
  total: number
  page: number
  pageSize: number
  raw?: unknown      // original payload
}

/**
 * Client-side shaping that tolerates multiple server field conventions.
 * Does NOT mutate or send anything to the server.
 */
export function shapeBatchSummary(input: any): BatchSummary {
  const id = String(input?.id ?? input?.batchId ?? input?.uuid ?? "")
  const name =
    String(
      input?.name ??
      input?.title ??
      input?.label ??
      (id ? `Batch ${id.slice(0, 8)}` : "Untitled Batch")
    )

  const type: BatchType =
    (input?.type ??
      input?.channel ??
      input?.category ??
      "unknown") as BatchType

  const status: BatchStatus =
    (input?.status ??
      input?.state ??
      input?.phase ??
      "queued") as BatchStatus

  const createdAtRaw =
    input?.createdAt ??
    input?.created_at ??
    input?.created ??
    input?.inserted_at ??
    null

  const createdAt =
    typeof createdAtRaw === "number"
      ? new Date(createdAtRaw).toISOString()
      : createdAtRaw
        ? new Date(createdAtRaw).toISOString()
        : new Date().toISOString()

  const itemsTotal =
    Number(
      input?.itemsTotal ??
      input?.totalItems ??
      input?.count ??
      input?.items_count ??
      0
    ) || 0

  const itemsProcessed =
    Number(
      input?.itemsProcessed ??
      input?.processedItems ??
      input?.processed ??
      input?.sent_count ??
      0
    ) || 0

  const progressPct =
    itemsTotal > 0 ? Math.min(100, Math.max(0, Math.round((itemsProcessed / itemsTotal) * 100))) : 0

  return {
    id,
    name,
    type,
    status,
    createdAt,
    itemsTotal,
    itemsProcessed,
    progressPct,
    raw: input
  }
}

/**
 * Shape a list response from common conventions:
 * - { items, total, page, pageSize }
 * - { data: [], total, page, per_page | pageSize }
 * - [] (array only) => items = array, total = array.length
 */
export function shapeListResponse(payload: any, params?: ListParams): ListResponse {
  let items: unknown[] = []
  let total = 0
  let page = Number(params?.page ?? 1)
  let pageSize = Number(params?.pageSize ?? 25)

  if (Array.isArray(payload)) {
    items = payload
    total = payload.length
  } else if (payload && typeof payload === "object") {
    const maybeItems =
      payload.items ??
      payload.data ??
      payload.results ??
      payload.rows ??
      payload.campaigns ?? // tolerate existing campaigns list endpoint
      null
    if (Array.isArray(maybeItems)) {
      items = maybeItems
    }
    const maybeTotal = payload.total ?? payload.count ?? payload.total_count
    if (typeof maybeTotal === "number") {
      total = maybeTotal
    } else if (Array.isArray(maybeItems)) {
      total = maybeItems.length
    }
    const maybePage = payload.page ?? payload.current_page
    if (typeof maybePage === "number") page = maybePage
    const maybePageSize = payload.pageSize ?? payload.per_page ?? payload.limit
    if (typeof maybePageSize === "number") pageSize = maybePageSize
  }

  return { items, total, page, pageSize, raw: payload }
}

/**
 * GET /api/batches with query params (or overridden base).
 * Returns raw data; caller can shape it with shapeListResponse and shapeBatchSummary.
 */
export async function fetchBatchesRaw(params: ListParams = {}): Promise<ApiResult<unknown>> {
  // Try configured/assumed base first (defaults to /api/batches).
  const primary = await getJson<unknown>(BATCHES_API_BASE, { query: params })
  // If that route doesn't exist in this backend, fall back to the existing /api/campaigns list.
  if (!primary.ok && primary.status === 404 && BATCHES_API_BASE !== "/api/campaigns") {
    const alt = await getJson<unknown>("/api/campaigns", { query: params })
    return alt
  }
  return primary
}

/**
 * GET one batch by ID: /api/batches/:id
 */
export async function fetchBatchRaw(id: string): Promise<ApiResult<unknown>> {
  return getJson<unknown>(`${BATCHES_API_BASE}/${encodeURIComponent(id)}`)
}

/**
 * POST create batch (payload must conform to server contract).
 */
export async function createBatchRaw(body: JsonValue): Promise<ApiResult<unknown>> {
  return postJson<unknown>(BATCHES_API_BASE, body)
}

/**
 * PATCH update batch
 */
export async function updateBatchRaw(id: string, body: JsonValue): Promise<ApiResult<unknown>> {
  return patchJson<unknown>(`${BATCHES_API_BASE}/${encodeURIComponent(id)}`, body)
}

/**
 * DELETE batch
 */
export async function deleteBatchRaw(id: string): Promise<ApiResult<unknown>> {
  return deleteJson<unknown>(`${BATCHES_API_BASE}/${encodeURIComponent(id)}`)
}