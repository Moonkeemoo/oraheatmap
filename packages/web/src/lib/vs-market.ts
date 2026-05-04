/**
 * Detect Polymarket "Team A vs Team B" sports markets and extract both sides.
 *
 * Polymarket head-to-head markets follow a small number of shapes:
 *   "Chiefs vs Bills"
 *   "Lakers @ Celtics"                      (NBA short form)
 *   "Internazionali BNL d'Italia, Qualification: P1 vs P2"  (tennis prefix)
 *
 * We deliberately reject prediction-style questions like "Will Lakers beat
 * Celtics?" — those aren't really two-sided icons, they're outcome bets on a
 * single primary entity.
 *
 * No external icon CDN is wired up; the renderer falls back to initials
 * badges. The parser is the part that's testable + cheap to evolve.
 */

const SEPARATOR_RE = /\s+(?:vs\.?|v\.?|@)\s+/i;
const QUESTION_TAIL = /\?\s*$/;
// Question words that disqualify "vs" matches inside prediction questions.
const QUESTION_PREFIX = /^(will|does|did|is|are|was|were|can|could|should|would|has|have|had|by what|by when|when|how|why)\b/i;
const MAX_TEAM_LEN = 40;
const MIN_TEAM_LEN = 1;

export type VsMarket = { teamA: string; teamB: string };

export function parseVsMarket(question: string | null | undefined): VsMarket | null {
  if (!question) return null;
  let q = question.trim();
  if (q.length === 0) return null;
  // "Will X vs Y happen?" — predictions, not matchups.
  if (QUESTION_TAIL.test(q)) return null;
  if (QUESTION_PREFIX.test(q)) return null;
  // Drop a leading "Tournament name, stage:" prefix so the matchup at the end
  // wins. Last ":" wins because some titles have multiple colons.
  const lastColon = q.lastIndexOf(":");
  if (lastColon !== -1 && lastColon < q.length - 2) q = q.slice(lastColon + 1).trim();

  // Splitting on the separator handles both "A vs B" and "A vs B vs C" — for
  // the round-robin third case we'd need a different layout, so we reject.
  const parts = q.split(SEPARATOR_RE).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const [teamA, teamB] = parts as [string, string];
  if (teamA.length < MIN_TEAM_LEN || teamB.length < MIN_TEAM_LEN) return null;
  if (teamA.length > MAX_TEAM_LEN || teamB.length > MAX_TEAM_LEN) return null;
  return { teamA, teamB };
}

/**
 * Compact display abbreviation for a team — initials of up to 3 words, capped
 * at 4 chars. "Los Angeles Lakers" → "LAL", "Chiefs" → "CHI", "P1" → "P1".
 */
export function teamAbbrev(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "?";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const initials = words
      .slice(0, 3)
      .map((w) => w[0]!.toUpperCase())
      .join("");
    return initials;
  }
  // Single-word: take first 3 letters uppercased. Keeps numerics/short codes
  // ("P1", "USA") readable.
  return trimmed.slice(0, 3).toUpperCase();
}

/**
 * Stable colour for a team name — same name always maps to the same hue.
 * Used for the initials badge background. djb2 hash → HSL.
 */
export function teamColor(name: string): string {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 55%, 42%)`;
}
