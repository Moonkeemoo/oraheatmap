"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useHeatmap } from "@/hooks/useHeatmap";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useRowOrder } from "@/hooks/useRowOrder";
import { useSse } from "@/hooks/useSse";
import { initAnalytics, track } from "@/lib/analytics";
import { applySignal } from "@/lib/heatmap-apply";
import { recordSignal } from "@/lib/live-clock";
import { useCellFeed } from "@/hooks/useCellFeed";
import { useCellStats } from "@/hooks/useCellStats";
import { metricToHighlightKind, useRowHighlights } from "@/hooks/useRowHighlights";
import { buildScopeKey } from "@/lib/row-order";
import { TOKENS } from "@/lib/tokens";
import type {
  Category,
  HeatmapCell,
  HeatmapMetric,
  LiveRange,
  MacroKind,
  Mode,
  PatternKind,
  SignalEvent,
} from "@/lib/types";
import { Breadcrumb } from "./Breadcrumb";
import { Footer } from "./Footer";
import { Grid } from "./Grid";
import { Header } from "./Header";
import { HeatmapSkeleton } from "./HeatmapSkeleton";
import { LoginModal } from "./LoginModal";
import { StatsBar } from "./StatsBar";
import { Tooltip, type TooltipAnchor } from "./Tooltip";
import { WhaleDrawer } from "./WhaleDrawer";

type HoverState = {
  cell: HeatmapCell;
  anchor: TooltipAnchor;
  category: string;
  slotLabel: string;
  cellId: string;
  /** Server-side index in data.cells[cat] (BEFORE display rotation) —
   *  PATTERN-cycles fetch needs this to compute the right slot when
   *  the cell ref goes stale across SSE refreshes. */
  originalSlotIdx: number;
};

/** Per-(category × slot index) flash counter. Keyed by `${cat}:${slot}` so that
 *  in PATTERN mode the cell matching the signal's hour-of-day or day-of-week
 *  flashes (not always the rightmost), and in LIVE mode only the NOW slot
 *  flashes. */
export type FlashByCell = Record<string, number>;

/** Per-cell exponentially-decaying heat. Each SSE signal bumps the
 *  matching cell by +1 and a 250ms tick multiplies all entries by
 *  HEAT_DECAY (≈ 1s half-life). The cell's heat value is what drives
 *  the glow-aura intensity. */
export type HeatByCell = Record<string, number>;

const DOW_DISPLAY_ORDER: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun, Sun last

/** Per-tick decay factor. With a 250ms tick interval, 0.83⁴ ≈ 0.47 →
 *  half-life around 1s. Burst of 5 signals decays back below visible
 *  threshold (0.05) in ~3.5s, single signal in ~1.5s. */
const HEAT_DECAY = 0.83;
const HEAT_TICK_MS = 250;
const HEAT_VISIBLE_FLOOR = 0.05;

/** Map a signal timestamp to the bucket index AS IT APPEARS IN SERVER RESPONSE.
 *  Grid handles local-TZ rotation separately for display. LIVE: last index (NOW).
 *  PATTERN-hour: server-side bucket = UTC hour / 2. The Grid then rotates that
 *    by `localShiftIdx` to display in the viewer's TZ. We mirror the same
 *    rotation here so a signal arriving at "local 08:30" lights up the column
 *    labelled 08:00 — not the column 2 hours behind. For non-2h-aligned TZs
 *    (Kyiv UTC+3, India UTC+5.5) the data underneath is still a UTC bucket;
 *    the visual flash just lands on the column the user sees as "now".
 *  PATTERN-dow: 0..6 in Mon..Sun display order. */
function parseSlotFromCellId(cellId: string): number | null {
  const idx = cellId.lastIndexOf(":");
  if (idx < 0) return null;
  const n = Number(cellId.slice(idx + 1));
  return Number.isFinite(n) ? n : null;
}

function flashSlotIndex(
  mode: Mode,
  kind: PatternKind | undefined,
  ts: string,
  bucketCount: number,
): number {
  if (mode === "live") return bucketCount - 1;
  const d = new Date(ts);
  if (kind === "hour-of-day") {
    // Use LOCAL hours so the flash aligns with the column header the user
    // perceives as "now". Grid keys flashByCell by display position via the
    // same shift, so the cell that lights up matches the live column dot.
    const localSlot = Math.floor(d.getHours() / 2);
    const tzOffset = -d.getTimezoneOffset() / 60;
    const shift = ((Math.round(-tzOffset / 2) % 12) + 12) % 12;
    // Reverse the rotation Grid will apply: flashByCell key = (display + shift) % 12.
    // We want display = localSlot, so key = (localSlot + shift) % 12.
    return (localSlot + shift) % 12;
  }
  if (kind === "day-of-week") return DOW_DISPLAY_ORDER.indexOf(d.getUTCDay());
  return -1;
}

export function Heatmap() {
  const [mode, setMode] = useState<Mode>("live");
  // Default view: 1h × volume — the freshest possible take, lands on the
  // page as a "live signals NOW" hook for anonymous visitors. Every
  // other range (24h / 12d / 12w) and mode/kind/metric requires auth.
  // Was 24h up to 2026-05-06; 1h reads more "real-time", which is the
  // value-prop pitch and easier on the cold cache (smaller payload).
  const [range, setRange] = useState<LiveRange>("1h");
  const [patternKind, setPatternKind] = useState<PatternKind>("hour-of-day");
  const [macroKind, setMacroKind] = useState<MacroKind>("hour-week");
  const [metric, setMetric] = useState<HeatmapMetric>("volume");
  const [drillCategory, setDrillCategory] = useState<Category | null>(null);
  const [drillSubcategory, setDrillSubcategory] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const { status: authStatus } = useSession();
  const isAuthed = authStatus === "authenticated";
  const isMobile = useIsMobile();

  // Initialise the analytics SDK once — fires session_start + the
  // initial pageview. Subsequent events fire as the user interacts.
  useEffect(() => {
    initAnalytics();
  }, []);

  // Detect a fresh sign-in: when authStatus flips from "unauthenticated"
  // to "authenticated", attribute the conversion to whichever modal-open
  // happened last. signinModalOpened markers stash the open timestamp so
  // we can also report time-to-signin. signin_completed without a
  // preceding modal_open (eg returning user with cookie) is dropped —
  // funnel only counts conversions originating in this tab.
  const prevAuthStatusRef = useRef<string>(authStatus);
  useEffect(() => {
    if (
      prevAuthStatusRef.current === "unauthenticated" &&
      authStatus === "authenticated"
    ) {
      const provider = (
        (window as unknown as { __ora_lastProvider?: string }).__ora_lastProvider ?? "siwe"
      ) as Parameters<typeof track.signinCompleted>[0];
      const t0 = (window as unknown as { __ora_signinT0?: number }).__ora_signinT0 ?? 0;
      const dt = t0 > 0 ? Date.now() - t0 : 0;
      track.signinCompleted(provider, dt);
    }
    prevAuthStatusRef.current = authStatus;
  }, [authStatus]);

  // Auto-open the LoginModal when navigated here with ?connect=...
  // (used by /account ConnectProviders for the Email + Telegram flows
  // that need their existing modal forms). Safe to run unconditionally
  // — modal stays closed for any non-matching value, including absent.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("connect")) {
      setLoginOpen(true);
      // Strip the param so a refresh doesn't re-open the modal forever.
      const url = new URL(window.location.href);
      url.searchParams.delete("connect");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);
  const [hover, setHover] = useState<HoverState | null>(null);
  // Click on a cell opens this in the right-side drawer (Tooltip in
  // `renderAs="drawer"` mode). Replaces the prior anchored "locked"
  // tooltip — UX equivalent of the WhaleDrawer pattern, the user can
  // keep peeking at other cells via hover while the panel stays put.
  // Clicking another cell SWAPS the panel content; clicking the same
  // cell again toggles it off.
  const [panelCell, setPanelCell] = useState<HoverState | null>(null);
  const [whaleProfileAddr, setWhaleProfileAddr] = useState<string | null>(null);
  // When the whale drawer is opened by clicking a whale row INSIDE a cell
  // panel, stash the panel state here so the drawer's ← button can pop
  // back to it. Cleared when the drawer is closed via X / overlay / ESC.
  const [whaleDrawerBackTo, setWhaleDrawerBackTo] = useState<HoverState | null>(null);
  // Live cell-feed for the open panel. Scope is derived from drill state +
  // panel cell's row key. ingest() is called from the single useSse below
  // (no second EventSource — keeps us under the per-origin SSE cap).
  const cellFeedScope = panelCell
    ? drillSubcategory != null
      ? // L3: panelCell.category IS the conditionId
        { category: drillCategory!, subcategory: drillSubcategory, conditionId: panelCell.category }
      : drillCategory
        ? // L2: panelCell.category IS the subcategory slug
          { category: drillCategory, subcategory: panelCell.category, conditionId: null }
        : // L1: panelCell.category is the actual category
          { category: panelCell.category, subcategory: null, conditionId: null }
    : null;
  const cellFeed = useCellFeed({ scope: cellFeedScope, enabled: panelCell !== null });
  const [flashByCell, setFlashByCell] = useState<FlashByCell>({});
  const [heatByCell, setHeatByCell] = useState<HeatByCell>({});
  const [pendingSignals, setPendingSignals] = useState<SignalEvent[]>([]);

  // Decay timer — drives cells back to "cold" once SSE quiets down.
  // Drops keys whose heat fell below the visible floor so the object
  // doesn't accumulate stale entries while the user keeps the tab open.
  useEffect(() => {
    const id = setInterval(() => {
      setHeatByCell((prev) => {
        let changed = false;
        const next: HeatByCell = {};
        for (const [k, v] of Object.entries(prev)) {
          const decayed = v * HEAT_DECAY;
          if (decayed >= HEAT_VISIBLE_FLOOR) {
            next[k] = decayed;
            if (decayed !== v) changed = true;
          } else {
            changed = true; // dropped key
          }
        }
        return changed ? next : prev;
      });
    }, HEAT_TICK_MS);
    return () => clearInterval(id);
  }, []);
  const rowOrder = useRowOrder();

  const { data: fetchedData, loading, error } = useHeatmap({
    mode,
    range: mode === "live" ? range : undefined,
    kind: mode === "pattern" ? patternKind : undefined,
    macroKind: mode === "macro" ? macroKind : undefined,
    lookbackDays: mode === "pattern" ? 30 : undefined,
    drillCategory,
    // L3 (per-market) drill: LIVE + MACRO. PATTERN doesn't carry
    // condition-id-level aggregates and the cycle-overlay chart shape
    // doesn't make sense per-market.
    drillSubcategory: mode === "pattern" ? null : drillSubcategory,
  });

  // Whenever a fresh fetch arrives, drop the optimistic queue.
  useEffect(() => {
    setPendingSignals([]);
  }, [fetchedData?.generatedAt]);

  // Top highlights — standout events for the panel's row, scoped to the
  // WHOLE header range (not the cell's bucket). Unit + sort follow the
  // active metric (pnl→trades by |pnl|, volume/signals/whales→markets).
  // Drawer-only — hover tooltip never fires this.
  const highlightsKind = metricToHighlightKind(metric);
  const highlightsScope =
    panelCell && cellFeedScope && fetchedData?.windowStart && fetchedData?.windowEnd && mode === "live"
      ? {
          ...cellFeedScope,
          fromTs: fetchedData.windowStart,
          toTs: fetchedData.windowEnd,
        }
      : null;
  const rowHighlights = useRowHighlights({
    scope: highlightsScope,
    metric: highlightsKind,
    enabled: panelCell !== null && mode === "live" && highlightsKind !== null,
  });

  // MACRO: per-cell top markets + top whales fetched on-demand.
  // Scope = (drill state) + (the bucket's own time window). Only fires
  // for the locked drawer cell, not on every hover.
  const cellStatsScope = (() => {
    if (!panelCell || !cellFeedScope || mode !== "macro" || !fetchedData) return null;
    const slot = parseSlotFromCellId(panelCell.cellId);
    const buckets = fetchedData.buckets;
    if (slot === null || slot < 0 || slot >= buckets.length) return null;
    const bucket = buckets[slot]!;
    const fromTs = bucket.ts ?? null;
    const nextBucket = buckets[slot + 1];
    const toTs =
      nextBucket?.ts ?? fetchedData.windowEnd ?? new Date().toISOString();
    if (!fromTs) return null;
    return { ...cellFeedScope, fromTs, toTs };
  })();
  const cellStats = useCellStats({
    scope: cellStatsScope,
    enabled: panelCell !== null && mode === "macro",
  });

  // Optimistic merge — only meaningful in LIVE mode (PATTERN values are
  // averages, not running sums; bumping by 1 doesn't make sense).
  const displayData = useMemo(() => {
    if (!fetchedData) return null;
    if (fetchedData.mode === "pattern") return fetchedData;
    let acc = fetchedData;
    for (const s of pendingSignals) acc = applySignal(acc, s);
    return acc;
  }, [fetchedData, pendingSignals]);

  useSse((s) => {
    // Stamp the live-clock for any signal — including ones the current
    // view filters out (the Header pill should still tick when SSE is
    // healthy, regardless of drill state).
    recordSignal();
    // Pump the same signal into the cell-feed hook; it filters by the
    // active panel scope and ignores everything else.
    cellFeed.ingest(s);

    if (!fetchedData) return;
    if (!metricAffectedBy(metric, s)) return;

    // Determine the row key the signal belongs to in the current view:
    //   L1 → s.category (must match one of fetchedData.categories)
    //   L2 → s.subcategory (must be in the drilled category's sublist)
    //   L3 → s.conditionId (must be one of the markets currently shown)
    let rowKey: string;
    if (fetchedData.drillSubcategory) {
      if (
        s.category !== fetchedData.drillCategory ||
        s.subcategory !== fetchedData.drillSubcategory ||
        !s.conditionId
      ) return;
      if (!fetchedData.categories.includes(s.conditionId)) return;
      rowKey = s.conditionId;
    } else if (fetchedData.drillCategory) {
      if (s.category !== fetchedData.drillCategory || !s.subcategory) return;
      if (!fetchedData.categories.includes(s.subcategory)) return;
      rowKey = s.subcategory;
    } else {
      if (!fetchedData.categories.includes(s.category)) return;
      rowKey = s.category;
    }

    const slotIdx = flashSlotIndex(
      fetchedData.mode,
      fetchedData.patternKind,
      s.ts,
      fetchedData.buckets.length,
    );
    if (slotIdx < 0 || slotIdx >= fetchedData.buckets.length) return;

    if (fetchedData.mode === "live") {
      setPendingSignals((prev) => [...prev, s]);
    }
    const key = `${rowKey}:${slotIdx}`;
    setFlashByCell((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
    setHeatByCell((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
  });

  // Reset hover + lock on mode/range/kind/drill switches (anchors + cell IDs
  // are stale across grid shape changes).
  useEffect(() => {
    setHover(null);
    setPanelCell(null);
  }, [mode, range, patternKind, drillCategory, drillSubcategory]);

  // Drilling out of a category should also clear any L3 state — going from
  // (Sports/NBA) back to "All categories" must NOT keep `nba` lying around.
  useEffect(() => {
    if (drillCategory === null && drillSubcategory !== null) setDrillSubcategory(null);
  }, [drillCategory, drillSubcategory]);

  // Analytics-instrumented setters. Use these everywhere instead of
  // raw setMode/setRange/etc so the events feed reflects only real
  // user-triggered changes (and not the noop case where prev === next).
  const trackedSetMode = (next: Mode): void => {
    if (next !== mode) track.modeChanged(mode, next);
    setMode(next);
  };
  const trackedSetRange = (next: LiveRange): void => {
    if (next !== range) track.rangeChanged(range, next);
    setRange(next);
  };
  const trackedSetMetric = (next: HeatmapMetric): void => {
    if (next !== metric) track.metricChanged(metric, next);
    setMetric(next);
  };
  const trackedSetPatternKind = (next: PatternKind): void => {
    if (next !== patternKind) track.patternKindChanged(patternKind, next);
    setPatternKind(next);
  };
  const trackedSetMacroKind = (next: MacroKind): void => {
    setMacroKind(next);
  };

  /** Single chokepoint for opening the login modal — emits the
   *  `signin_modal_opened` event with the trigger source so the funnel
   *  data can attribute "what gated feature drove the auth attempt". */
  const requestLogin = (
    triggerSource: Parameters<typeof track.signinModalOpened>[0],
  ): void => {
    track.signinModalOpened(triggerSource);
    // Stash the open-ts so the post-auth effect can report
    // time-to-signin as part of signin_completed.
    if (typeof window !== "undefined") {
      (window as unknown as { __ora_signinT0?: number }).__ora_signinT0 = Date.now();
    }
    setLoginOpen(true);
  };


  const isLive = mode === "live";
  const daysOfData = displayData?.dataSpan.daysOfData ?? 0;
  // PATTERN is always clickable. Sample size shows up in the subtitle
  // ("low sample" badge under 7d) so the user can interpret accordingly,
  // rather than the tab being silently locked.
  const patternUnlocked = true;
  const lowSample = daysOfData < 7;

  return (
    <div
      // app-shell carries the height: 100vh / height: 100dvh pair via
      // globals.css — the duplicate-property fallback can't be expressed
      // via inline-style React (object keys deduped). dvh tracks iOS
      // Safari's collapsing address bar so the Header doesn't slide
      // off-screen as the toolbar resizes.
      className="app-shell"
      style={{
        width: "100vw",
        maxWidth: "100vw",
        background: TOKENS.bg,
        color: TOKENS.text,
        fontFamily: TOKENS.font,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflowX: "hidden",
        // Prevent the page itself from scrolling — only the inner middle
        // wrapper scrolls. Otherwise iOS Safari can drag the whole
        // Heatmap root and unstick the Header.
        overflowY: "hidden",
        boxSizing: "border-box",
      }}
    >
      <Header
        mode={mode}
        setMode={trackedSetMode}
        metric={metric}
        setMetric={trackedSetMetric}
        range={range}
        setRange={trackedSetRange}
        patternKind={patternKind}
        setPatternKind={trackedSetPatternKind}
        macroKind={macroKind}
        setMacroKind={trackedSetMacroKind}
        isLive={isLive}
        trackedCount={displayData?.trackedWhales ?? 0}
        lookbackDays={displayData?.lookbackDays ?? 30}
        patternUnlocked={patternUnlocked}
        daysOfData={daysOfData}
        lowSample={lowSample}
        onRequestLogin={() => requestLogin("header")}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          // Mobile gets tighter chrome so cells get more pixels. Also
          // allow horizontal scroll for the grid — macro 168 cells can't
          // fit in 360px and even LIVE 12 cells get unreadable below
          // ~22px each. Vertical scroll still applies for tall drill rows.
          padding: isMobile ? "8px 6px 6px" : "14px 24px 10px",
          position: "relative",
          overflowY: "auto",
          overflowX: isMobile ? "auto" : "visible",
          boxSizing: "border-box",
        }}
      >
        {error && (
          <div style={{ color: TOKENS.neg, fontFamily: TOKENS.mono, fontSize: 12 }}>
            api error: {error}
          </div>
        )}
        {loading && !displayData && <HeatmapSkeleton />}
        {displayData && (
          <>
            {displayData.drillCategory && (
              <Breadcrumb
                drillCategory={displayData.drillCategory}
                drillSubcategory={displayData.drillSubcategory}
                drillSubcategoryLabel={
                  displayData.drillSubcategory
                    ? displayData.subcategoryLabels?.[displayData.drillSubcategory] ?? null
                    : null
                }
                onBackToTop={() => {
                  setDrillCategory(null);
                  setDrillSubcategory(null);
                }}
                onBackToCategory={() => setDrillSubcategory(null)}
              />
            )}
            {(() => {
              // Scope key encodes (level, mode, parents). Range is intentionally
              // NOT in the scope — a user's preferred Sports order survives
              // 1h↔24h↔7d. Pattern HOUR vs DOW vs LIVE each carry independent
              // orders so reordering one mode doesn't bleed into another.
              const level: 1 | 2 | 3 = displayData.drillSubcategory
                ? 3
                : displayData.drillCategory
                  ? 2
                  : 1;
              const parents: string[] = displayData.drillSubcategory
                ? [displayData.drillCategory!, displayData.drillSubcategory]
                : displayData.drillCategory
                  ? [displayData.drillCategory]
                  : [];
              const scopeKey = buildScopeKey(
                displayData.mode,
                displayData.mode === "pattern" ? patternKind : null,
                level,
                parents,
              );
              return (
                <Grid
                  data={displayData}
                  metric={metric}
                  onHover={(h) => setHover(h)}
                  onClick={(h) => {
                    // Toggle: clicking the same cell again closes the panel.
                    // Clicking a different cell SWAPS content (instead of
                    // close-then-open) — Tooltip re-renders with new props.
                    // Mutually exclusive with WhaleDrawer — opening one
                    // closes the other so they don't stack to the right.
                    const willOpen = panelCell?.cellId !== h.cellId;
                    setPanelCell((prev) => (prev?.cellId === h.cellId ? null : h));
                    setWhaleProfileAddr(null);
                    if (willOpen) {
                      const level: 1 | 2 | 3 = displayData.drillSubcategory
                        ? 3
                        : displayData.drillCategory
                          ? 2
                          : 1;
                      // Slot index parsed off the cellId; LIVE's last
                      // bucket is "now" — the most actionable slot to
                      // know users actually click.
                      const slotIdx = parseSlotFromCellId(h.cellId);
                      const isNow =
                        mode === "live" &&
                        slotIdx !== null &&
                        slotIdx === displayData.buckets.length - 1;
                      track.cellOpen(level, h.category, isNow);
                    }
                  }}
                  onRowClick={
                    // PATTERN doesn't support L3 (per-market) drill — bail
                    // out when we're already inside a category, otherwise the
                    // › chevron leads nowhere.
                    mode === "pattern" && displayData.drillCategory
                      ? undefined
                      : !displayData.drillCategory
                        ? (key) => {
                            if (isAuthed) {
                              track.drillOpen(2, key);
                              setDrillCategory(key as Category);
                            } else {
                              requestLogin("drill_locked");
                            }
                          }
                        : !displayData.drillSubcategory
                          ? (key) => {
                              if (isAuthed) {
                                track.drillOpen(3, displayData.drillCategory!, key);
                                setDrillSubcategory(key);
                              } else {
                                requestLogin("drill_locked");
                              }
                            }
                          : undefined
                  }
                  lockedCellId={panelCell?.cellId ?? null}
                  flashByCell={flashByCell}
                  heatByCell={heatByCell}
                  gridKey={`${mode}-${range}-${patternKind}-${drillCategory ?? "top"}`}
                  savedOrder={rowOrder.get(scopeKey)}
                  onReorder={(next) => rowOrder.set(scopeKey, next)}
                  reorderEnabled={isAuthed}
                  onRequestLogin={() => requestLogin("reorder")}
                />
              );
            })()}
            {panelCell && (
              <Tooltip
                key={`panel-${panelCell.cellId}`}
                cell={panelCell.cell}
                rowCells={displayData.cells[panelCell.category] ?? []}
                anchor={panelCell.anchor}
                category={panelCell.category as Category}
                slotLabel={panelCell.slotLabel}
                mode={displayData.mode}
                range={range}
                patternKind={patternKind}
                metric={metric}
                lookbackDays={displayData.lookbackDays ?? 30}
                locked
                renderAs="drawer"
                parentCategory={
                  (displayData.drillCategory as Category | null | undefined) ?? null
                }
                // L2: row key is a subcategory slug — show its display
                // label ("NBA") on the badge, not the parent category.
                displayLabel={
                  displayData.drillCategory && !displayData.drillSubcategory
                    ? displayData.subcategoryLabels?.[panelCell.category] ?? null
                    : null
                }
                slotIndex={parseSlotFromCellId(panelCell.cellId)}
                originalSlotIdx={panelCell.originalSlotIdx}
                feed={{ entries: cellFeed.entries, loading: cellFeed.loading }}
                highlights={
                  mode === "live" && highlightsKind
                    ? {
                        data: rowHighlights.data,
                        loading: rowHighlights.loading,
                        range,
                      }
                    : null
                }
                cellStats={
                  mode === "macro"
                    ? { data: cellStats.data, loading: cellStats.loading }
                    : null
                }
                isAuthed={isAuthed}
                onRequestLogin={() => requestLogin("cell_open")}
                // Clicking a whale row inside the cell panel pivots to that
                // whale's full drawer — close the cell panel so the two
                // right-side surfaces never stack. Stash the panel for
                // ← restore from the whale drawer.
                onWhaleClick={(addr) => {
                  track.whaleDrawerOpen("cell", addr);
                  setWhaleDrawerBackTo(panelCell);
                  setPanelCell(null);
                  setWhaleProfileAddr(addr);
                }}
                drillSubcategory={displayData.drillSubcategory}
                headerIcon={
                  displayData.drillSubcategory
                    ? displayData.marketIcons?.[panelCell.category] ?? null
                    : null
                }
                headerTitle={
                  displayData.drillSubcategory
                    ? displayData.marketQuestions?.[panelCell.category] ?? null
                    : null
                }
                headerCrumb={
                  displayData.drillSubcategory
                    ? `${displayData.drillCategory} · ${displayData.drillSubcategoryLabel ?? ""}`
                    : null
                }
                onClose={() => setPanelCell(null)}
              />
            )}
            {!isMobile && hover && hover.cellId !== panelCell?.cellId && (
              <Tooltip
                key={`hover-${hover.cellId}`}
                cell={hover.cell}
                rowCells={displayData.cells[hover.category] ?? []}
                anchor={hover.anchor}
                category={hover.category as Category}
                slotLabel={hover.slotLabel}
                mode={displayData.mode}
                range={range}
                patternKind={patternKind}
                metric={metric}
                lookbackDays={displayData.lookbackDays ?? 30}
                locked={false}
                parentCategory={
                  (displayData.drillCategory as Category | null | undefined) ?? null
                }
                displayLabel={
                  displayData.drillCategory && !displayData.drillSubcategory
                    ? displayData.subcategoryLabels?.[hover.category] ?? null
                    : null
                }
                slotIndex={parseSlotFromCellId(hover.cellId)}
                originalSlotIdx={hover.originalSlotIdx}
                isAuthed={isAuthed}
                onRequestLogin={() => requestLogin("cell_open")}
                onWhaleClick={(addr) => {
                  track.whaleDrawerOpen("tooltip", addr);
                  setWhaleProfileAddr(addr);
                }}
                drillSubcategory={displayData.drillSubcategory}
                headerIcon={
                  displayData.drillSubcategory
                    ? displayData.marketIcons?.[hover.category] ?? null
                    : null
                }
                headerTitle={
                  displayData.drillSubcategory
                    ? displayData.marketQuestions?.[hover.category] ?? null
                    : null
                }
                headerCrumb={
                  displayData.drillSubcategory
                    ? `${displayData.drillCategory} · ${displayData.drillSubcategoryLabel ?? ""}`
                    : null
                }
              />
            )}
          </>
        )}
      </div>

      {displayData && (
        <StatsBar
          data={displayData}
          trackedCount={displayData.trackedWhales}
          isAuthed={isAuthed}
          onRequestLogin={() => requestLogin("stats")}
          onWhaleClick={(addr) => {
            track.whaleDrawerOpen("stats", addr);
            setWhaleProfileAddr(addr);
          }}
        />
      )}
      <Footer compact />
      <WhaleDrawer
        addr={whaleProfileAddr}
        range={range}
        onClose={() => {
          setWhaleProfileAddr(null);
          setWhaleDrawerBackTo(null);
        }}
        onBack={
          whaleDrawerBackTo
            ? () => {
                const restore = whaleDrawerBackTo;
                setWhaleDrawerBackTo(null);
                setWhaleProfileAddr(null);
                setPanelCell(restore);
              }
            : undefined
        }
      />
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}

function metricAffectedBy(metric: HeatmapMetric, s: SignalEvent): boolean {
  switch (metric) {
    case "signals":
      return true;
    case "volume":
      return s.side === "BUY";
    case "pnl":
    case "winrate":
      return s.realizedPnl !== null && s.realizedPnl !== 0;
    case "whales":
      // Any signal could be the first from a new whale in this slot — we
      // can't tell client-side without a duplicate-whale check, so flash
      // optimistically. Worst case the cell highlights once even though
      // the whale was already there; the next refetch corrects the count.
      return true;
  }
}
