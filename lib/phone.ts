/**
 * Shared phone normalization and validation utilities
 * Single source of truth for:
 *  - population (start seeding)
 *  - dispatch selection (filtering before send)
 *  - UI counters (normalized_phone availability)
 *
 * E.164 rules:
 *  - Must start with +
 *  - Country code 1-3 digits, total digits 8-15 (recommend 10-15)
 *  - Only digits after +
 *
 * Special handling for +256 (Uganda): allow local formats like "2567..." or "07..." to normalize.
 */

export type PhoneValidation = {
  raw: string | null
  normalized: string | null
  valid: boolean
  reason?: string
}

const E164_REGEX = /^\+[1-9]\d{7,14}$/

export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const s = raw.trim()
  if (!s) return null

  // Strip spaces, dashes, parentheses, dots
  let digits = s.replace(/[\s\-\.\(\)]/g, "")

  // If it already starts with + and matches E.164, accept
  if (digits.startsWith("+")) {
    const maybe = "+" + digits.slice(1).replace(/[^\d]/g, "")
    return E164_REGEX.test(maybe) ? maybe : null
  }

  // If it starts with 00 (international prefix), convert to +
  if (digits.startsWith("00")) {
    const plus = "+" + digits.slice(2)
    return E164_REGEX.test(plus) ? plus : null
  }

  // Uganda special-casing:
  // - If it starts with 2567..., treat as +2567...
  if (/^256\d{8,12}$/.test(digits)) {
    const plus256 = "+" + digits
    return E164_REGEX.test(plus256) ? plus256 : null
  }
  // - If it starts with 07... or 7..., assume +256
  if (/^0?7\d{8}$/.test(digits)) {
    const ug = "+256" + digits.replace(/^0?7/, "7")
    return E164_REGEX.test(ug) ? ug : null
  }

  // Generic local to E.164 fallback: if 10-12 digits and starts with 1-9, assume it's already international without '+'
  if (/^[1-9]\d{9,11}$/.test(digits)) {
    const guess = "+" + digits
    return E164_REGEX.test(guess) ? guess : null
  }

  return null
}

export function isValidPhone(value: unknown): boolean {
  const norm = normalizePhone(value)
  return !!norm && E164_REGEX.test(norm)
}

export function validatePhone(value: unknown): PhoneValidation {
  const raw = typeof value === "string" ? value : null
  const normalized = normalizePhone(value)
  const valid = !!normalized
  return {
    raw,
    normalized,
    valid,
    reason: valid ? undefined : "Invalid phone; must be E.164 (e.g. +2567XXXXXXXX) or convertible",
  }
}