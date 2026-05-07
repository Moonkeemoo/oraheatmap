"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type {
  Category,
  HeatmapMetric,
  LiveRange,
  MacroKind,
  Mode,
  PatternKind,
  Subject,
} from "@/lib/types";

/**
 * URL-backed filter state for the heatmap.
 *
 * Encapsulates all the read/write plumbing that used to live as eight
 * `useState(() => parseFoo(searchParams.get("foo")) ?? defaultFoo)`
 * blocks plus a sync useEffect inside Heatmap.tsx. Hook exposes the
 * canonical state + setters; the caller treats it like normal state.
 *
 * URL keys (kept short to fit in shareable links without escaping):
 *   subject  trades | whales              (default trades, omitted)
 *   mode     live | pattern | macro       (default live, omitted)
 *   range    1h | 24h | 12d | 12w         (default 1h, omitted)
 *   pkind    hour-of-day | day-of-week    (default hour-of-day, omitted)
 *   mkind    hour-week | day-12w          (default hour-week, omitted)
 *   metric   pnl | volume | signals | whales | winrate (default volume)
 *   cat      <category slug>              (drill L1, omitted at top)
 *   sub      <subcategory slug>           (drill L2, omitted at top)
 *
 * All defaults are omitted from the URL so the canonical "fresh" view
 * is just `/app` with no params — only non-default selections emit a
 * query string. router.replace + scroll: false keeps every toggle out
 * of the back-history.
 */
export type UrlFilters = {
  subject: Subject;
  mode: Mode;
  range: LiveRange;
  patternKind: PatternKind;
  macroKind: MacroKind;
  metric: HeatmapMetric;
  drillCategory: Category | null;
  drillSubcategory: string | null;
  setSubject: (s: Subject) => void;
  setMode: (m: Mode) => void;
  setRange: (r: LiveRange) => void;
  setPatternKind: (k: PatternKind) => void;
  setMacroKind: (k: MacroKind) => void;
  setMetric: (m: HeatmapMetric) => void;
  setDrillCategory: (c: Category | null) => void;
  setDrillSubcategory: (s: string | null) => void;
};

export function useUrlFilters(): UrlFilters {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [subject, setSubject] = useState<Subject>(
    () => parseSubject(searchParams?.get("subject")) ?? "trades",
  );
  const [mode, setMode] = useState<Mode>(
    () => parseMode(searchParams?.get("mode")) ?? "live",
  );
  const [range, setRange] = useState<LiveRange>(
    () => parseRange(searchParams?.get("range")) ?? "1h",
  );
  const [patternKind, setPatternKind] = useState<PatternKind>(
    () => parsePatternKind(searchParams?.get("pkind")) ?? "hour-of-day",
  );
  const [macroKind, setMacroKind] = useState<MacroKind>(
    () => parseMacroKind(searchParams?.get("mkind")) ?? "hour-week",
  );
  const [metric, setMetric] = useState<HeatmapMetric>(
    () => parseMetric(searchParams?.get("metric")) ?? "volume",
  );
  const [drillCategory, setDrillCategory] = useState<Category | null>(
    () => (searchParams?.get("cat") as Category | null) ?? null,
  );
  const [drillSubcategory, setDrillSubcategory] = useState<string | null>(
    () => searchParams?.get("sub") ?? null,
  );

  // Snap metric to volume when subject flips to whales while metric is
  // whales — per-cell distinct-whale count is meaningless when each
  // row IS one whale.
  useEffect(() => {
    if (subject === "whales" && metric === "whales") {
      setMetric("volume");
    }
  }, [subject, metric]);

  // Drilling out of a category should also clear any L3 state — going
  // from (Sports/NBA) back to "All categories" must NOT keep `nba`
  // lying around.
  useEffect(() => {
    if (drillCategory === null && drillSubcategory !== null) {
      setDrillSubcategory(null);
    }
  }, [drillCategory, drillSubcategory]);

  // Sync state → URL. router.replace (not push) so each toggle isn't
  // a separate history entry. scroll: false so the page doesn't jump
  // to top on every URL update.
  useEffect(() => {
    const params = new URLSearchParams();
    if (subject !== "trades") params.set("subject", subject);
    if (mode !== "live") params.set("mode", mode);
    if (mode === "live" && range !== "1h") params.set("range", range);
    if (mode === "pattern" && patternKind !== "hour-of-day") {
      params.set("pkind", patternKind);
    }
    if (mode === "macro" && macroKind !== "hour-week") {
      params.set("mkind", macroKind);
    }
    if (metric !== "volume") params.set("metric", metric);
    if (drillCategory) params.set("cat", drillCategory);
    if (drillSubcategory) params.set("sub", drillSubcategory);
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url, { scroll: false });
  }, [
    subject,
    mode,
    range,
    patternKind,
    macroKind,
    metric,
    drillCategory,
    drillSubcategory,
    pathname,
    router,
  ]);

  return {
    subject,
    mode,
    range,
    patternKind,
    macroKind,
    metric,
    drillCategory,
    drillSubcategory,
    setSubject,
    setMode,
    setRange,
    setPatternKind,
    setMacroKind,
    setMetric,
    setDrillCategory,
    setDrillSubcategory,
  };
}

// ── URL parsers ──────────────────────────────────────────────────────
// All return undefined for unknown / missing values so the lazy
// initialiser falls through to the default. Keeps URL deserialisation
// in one place — every state field has the same shape: parse(input) ??
// "default".

function parseSubject(v: string | null | undefined): Subject | undefined {
  return v === "trades" || v === "whales" ? v : undefined;
}
function parseMode(v: string | null | undefined): Mode | undefined {
  return v === "live" || v === "pattern" || v === "macro" ? v : undefined;
}
function parseRange(v: string | null | undefined): LiveRange | undefined {
  return v === "1h" || v === "24h" || v === "12d" || v === "12w" ? v : undefined;
}
function parsePatternKind(
  v: string | null | undefined,
): PatternKind | undefined {
  return v === "hour-of-day" || v === "day-of-week" ? v : undefined;
}
function parseMacroKind(v: string | null | undefined): MacroKind | undefined {
  return v === "hour-week" || v === "day-12w" ? v : undefined;
}
function parseMetric(v: string | null | undefined): HeatmapMetric | undefined {
  return v === "pnl" ||
    v === "volume" ||
    v === "signals" ||
    v === "whales" ||
    v === "winrate"
    ? v
    : undefined;
}
