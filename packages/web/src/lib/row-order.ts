/**
 * Per-user heatmap row ordering helpers.
 *
 * Backend stores `ordered_keys: string[]` per (user, scope). Scope encodes
 * (level, mode, parents): "L1:LIVE", "L2:LIVE:Sports", "L3:PATTERN-HOUR:Sports:NBA".
 * Range is intentionally NOT in the scope — the same order applies across
 * 1h/24h/7d/30d within a (mode, level, parents) tuple.
 */

export type Mode = "live" | "pattern" | "highlights";
export type PatternKind = "hour-of-day" | "day-of-week";

/** Build the scope key sent to the backend. parents is the chain from root
 *  toward the current level — empty at L1, [category] at L2, [category,
 *  subcategory] at L3. Highlights and Live share the same scope key so a
 *  user's row order survives mode-toggling between them. */
export function buildScopeKey(
  mode: Mode,
  patternKind: PatternKind | null,
  level: 1 | 2 | 3,
  parents: ReadonlyArray<string>,
): string {
  const modeKey =
    mode === "pattern"
      ? patternKind === "day-of-week"
        ? "PATTERN-DOW"
        : "PATTERN-HOUR"
      : "LIVE";
  return `L${level}:${modeKey}${parents.length > 0 ? ":" + parents.join(":") : ""}`;
}

/**
 * Reorder `defaultOrder` (the server-side natural ranking) according to
 * `saved` (the user's persisted preference for this scope).
 *
 * Behaviour for keys that appear in `defaultOrder` but NOT in `saved`
 * (i.e. categories/markets that have shown up since the last save):
 * insert them at their NATURAL position — directly after the nearest
 * preceding default-order neighbour that's already in the saved list.
 * If no such neighbour exists, the new key goes to the front.
 *
 * Keys that exist in `saved` but no longer in `defaultOrder` are dropped.
 *
 * Pure function — no side effects, returns a new array.
 */
export function applyOrder(
  defaultOrder: ReadonlyArray<string>,
  saved: ReadonlyArray<string> | undefined,
): string[] {
  if (!saved || saved.length === 0) return [...defaultOrder];
  const defaultSet = new Set(defaultOrder);
  // Start with saved order, filtered to only keys that still exist.
  const kept = saved.filter((k) => defaultSet.has(k));
  const keptSet = new Set(kept);

  // For each key in defaultOrder that is NOT in saved, find its insertion
  // position by walking BACKWARDS in defaultOrder until we find a kept
  // neighbour, then insert just after that neighbour in the result.
  const result = [...kept];
  for (let i = 0; i < defaultOrder.length; i++) {
    const key = defaultOrder[i]!;
    if (keptSet.has(key)) continue;
    // Find nearest kept neighbour to the LEFT in defaultOrder.
    let neighbour: string | null = null;
    for (let j = i - 1; j >= 0; j--) {
      const candidate = defaultOrder[j]!;
      if (keptSet.has(candidate)) {
        neighbour = candidate;
        break;
      }
    }
    if (neighbour === null) {
      result.unshift(key);
    } else {
      const idx = result.indexOf(neighbour);
      result.splice(idx + 1, 0, key);
    }
    keptSet.add(key);
  }
  return result;
}
