/**
 * API client wrapper: preserves server contracts, shapes errors client-side only.
 * - Does not alter endpoints, headers, or payloads.
 * - Defaults to credentials: 'include' to preserve cookie/session auth.
 * - Adds robust error parsing for { error, code, details } JSON formats and fallback text.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export type ApiError = {
  status: number;
  error?: string;
  code?: string | number;
  details?: unknown;
  message?: string;
  url?: string;
  raw?: unknown;
};

export type ApiResult<T> = {
  ok: true;
  status: number;
  data: T;
  response: Response;
} | {
  ok: false;
  status: number;
  error: ApiError;
  response: Response | null;
};

export type FetchOptions = Omit<RequestInit, "body"> & {
  query?: QueryParams;
  // Keep payload shape identical to server expectations; caller sets it.
  // If you pass an object, it will be JSON.stringified with content-type set.
  body?: BodyInit | JsonValue;
  headers?: HeadersInit;
};

/**
 * Build URL with query string safely.
 */
export function buildUrl(baseUrl: string, query?: QueryParams): string {
  if (!query || Object.keys(query).length === 0) return baseUrl;
  const url = new URL(baseUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  for (const [key, val] of Object.entries(query)) {
    if (val === undefined || val === null) continue;
    url.searchParams.set(key, String(val));
  }
  return url.toString();
}

/**
 * Merge headers with normalization.
 */
function mergeHeaders(a?: HeadersInit, b?: HeadersInit): HeadersInit {
  const out = new Headers(a || {});
  const next = new Headers(b || {});
  next.forEach((value, key) => out.set(key, value));
  return out;
}

/**
 * Default headers: accept JSON. Content-Type set only if body is JSON.
 */
function defaultHeaders(): HeadersInit {
  return {
    Accept: "application/json",
  };
}

/**
 * Normalize body and headers. If body is a plain object/array, send JSON.
 */
function normalizeBodyAndHeaders(body: FetchOptions["body"], headers: HeadersInit) {
  if (body === undefined || body === null) {
    return { body: undefined, headers };
  }
  const isJsonLike =
    typeof body === "object" &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer) &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof ReadableStream);

  if (isJsonLike) {
    const merged = mergeHeaders(headers, { "Content-Type": "application/json" });
    return { body: JSON.stringify(body as JsonValue), headers: merged };
  }
  return { body: body as BodyInit, headers };
}

/**
 * Parse response body safely as JSON with graceful fallback to text.
 */
async function parseResponse<T>(res: Response): Promise<{ data?: T; text?: string; raw?: unknown }> {
  const contentType = res.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const json = (await res.json()) as unknown as T;
      return { data: json, raw: json };
    }
    const text = await res.text();
    return { text, raw: text };
  } catch (err) {
    // Some bodies are empty or not readable twice
    return { raw: null };
  }
}

/**
 * Convert non-OK response into a structured ApiError without changing server format.
 */
function toApiError(url: string, status: number, parsed: { data?: any; text?: string; raw?: unknown }): ApiError {
  const d = parsed.data as any | undefined;
  if (d && (typeof d === "object" || Array.isArray(d))) {
    // Common error shapes: { error, code, details, message }
    const err: ApiError = {
      status,
      url,
      error: d.error ?? d.message ?? "Request failed",
      code: d.code,
      details: d.details ?? d.errors ?? d.data,
      message: d.message ?? d.error,
      raw: d,
    };
    return err;
  }
  const text = parsed.text;
  return {
    status,
    url,
    error: text || "Request failed",
    message: text || "Request failed",
    raw: parsed.raw,
  };
}

/**
 * fetchJson: core fetch wrapper.
 * - Keeps credentials included for cookie-based auth.
 * - Does not auto-add Authorization or tenant headers; pass them explicitly in options.headers if required.
 * - Returns ApiResult<T> so callers can branch on ok status without throwing.
 */
export async function fetchJson<T = unknown>(url: string, options: FetchOptions = {}): Promise<ApiResult<T>> {
  const { query, headers, body, ...rest } = options;
  const fullUrl = buildUrl(url, query);
  const mergedHeaders = mergeHeaders(defaultHeaders(), headers);
  const { body: normalizedBody, headers: finalHeaders } = normalizeBodyAndHeaders(body, mergedHeaders);

  let response: Response | null = null;

  try {
    response = await fetch(fullUrl, {
      credentials: "include", // preserve cookies/session
      ...rest,
      headers: finalHeaders,
      body: normalizedBody,
    });

    const parsed = await parseResponse<T>(response);

    if (response.ok) {
      // If body was empty, return undefined as data (callers should handle)
      return {
        ok: true,
        status: response.status,
        data: (parsed.data as T) ?? (undefined as unknown as T),
        response,
      };
    }

    const error = toApiError(fullUrl, response.status, parsed);
    return { ok: false, status: response.status, error, response };
  } catch (e: any) {
    const status = response?.status ?? 0;
    const error: ApiError = {
      status,
      url,
      error: e?.message || "Network error",
      message: e?.message || "Network error",
      raw: e,
    };
    return { ok: false, status, error, response: response ?? null };
  }
}

/**
 * Helper: GET JSON
 */
export function getJson<T = unknown>(url: string, options: Omit<FetchOptions, "method"> = {}) {
  return fetchJson<T>(url, { method: "GET", ...options });
}

/**
 * Helper: POST JSON
 */
export function postJson<T = unknown>(url: string, body?: JsonValue, options: Omit<FetchOptions, "method" | "body"> = {}) {
  return fetchJson<T>(url, { method: "POST", body, ...options });
}

/**
 * Helper: PATCH JSON
 */
export function patchJson<T = unknown>(url: string, body?: JsonValue, options: Omit<FetchOptions, "method" | "body"> = {}) {
  return fetchJson<T>(url, { method: "PATCH", body, ...options });
}

/**
 * Helper: DELETE
 */
export function deleteJson<T = unknown>(url: string, options: Omit<FetchOptions, "method"> = {}) {
  return fetchJson<T>(url, { method: "DELETE", ...options });
}