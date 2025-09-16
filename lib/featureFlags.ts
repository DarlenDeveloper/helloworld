/**
 * Feature flags for UI-only rollouts.
 * Reads NEXT_PUBLIC_* env vars at build-time.
 * Do NOT gate any server behavior here; this is client-side only.
 */
export const isBatchesV2Enabled = (): boolean => {
  // NEXT_PUBLIC_ vars are inlined at build time by Next.js
  const val = process.env.NEXT_PUBLIC_BATCHES_UI_V2;
  return val === '1' || val?.toLowerCase() === 'true';
};