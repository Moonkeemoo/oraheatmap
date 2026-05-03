/**
 * Display helpers for whale addresses. Pure & deterministic — same address
 * always produces the same alias and color, so the UI can render trades from
 * either /api/heatmap or /api/stream consistently and even compute these on
 * the client without a round-trip.
 */

/**
 * `0xadc2efbf97ce7b25f7a638aabdba196c657cd1c9` → `0xadc2…cd1c9`.
 * For non-address inputs (e.g. test fixtures) we still produce a sensible
 * truncation rather than crash.
 */
export function whaleAlias(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-5)}`;
}

/**
 * Deterministic HSL color derived from the address bytes (post-`0x`). Hue is
 * 0..360 from a fast string hash; saturation/lightness fixed for visual
 * consistency. Returned as a CSS-ready `hsl(...)` string so the UI can drop
 * it straight into a style attribute.
 */
export function whaleColor(addr: string): string {
  // Skip `0x` prefix if present so two addresses that only differ in case
  // produce the same hue regardless.
  const start = addr.startsWith("0x") ? 2 : 0;
  let h = 0;
  for (let i = start; i < addr.length; i++) {
    // (h * 31 + ch) | 0 — same simple polynomial hash as Java's String.hashCode
    h = (Math.imul(h, 31) + addr.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}
