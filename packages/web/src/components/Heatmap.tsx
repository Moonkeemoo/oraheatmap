"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useHeatmap } from "@/hooks/useHeatmap";
import { useRowOrder } from "@/hooks/useRowOrder";
import { useSse } from "@/hooks/useSse";
import { applySignal } from "@/lib/heatmap-apply";
import { recordSignal } from "@/lib/live-clock";
import { useCellFeed } from "@/hooks/useCellFeed";
import { buildScopeKey } from "@/lib/row-order";
import { TOKENS } from "@/lib/tokens";
import type {
  Category,
  HeatmapCell,
  HeatmapMetric,
  LiveRange,
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
};

/** Per-(category × slot index) flash counter. Keyed by `${cat}:${slot}` so that
 *  in PATTERN mode the cell matching the signal's hour-of-day or day-of-week
 *  flashes (not always the rightmost), and in LIVE mode only the NOW slot
 *  flashes. */
export type FlashByCell = Record<string, number>;

const DOW_DISPLAY_ORDER: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun, Sun last

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
  // Default view: 24h × volume — most informative single-glance combination
  // for an unauthenticated visitor (volume = "where is money flowing today").
  // Every other range/mode/kind/metric requires auth.
  const [range, setRange] = useState<LiveRange>("24h");
  const [patternKind, setPatternKind] = useState<PatternKind>("hour-of-day");
  const [metric, setMetric] = useState<HeatmapMetric>("volume");
  const [drillCategory, setDrillCategory] = useState<Category | null>(null);
  const [drillSubcategory, setDrillSubcategory] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const { status: authStatus } = useSession();
  const isAuthed = authStatus === "authenticated";

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
  const [pendingSignals, setPendingSignals] = useState<SignalEvent[]>([]);
  const rowOrder = useRowOrder();

  const { data: fetchedData, loading, error } = useHeatmap({
    mode,
    range: mode === "live" ? range : undefined,
    kind: mode === "pattern" ? patternKind : undefined,
    lookbackDays: mode === "pattern" ? 30 : undefined,
    drillCategory,
    // L3 (per-market) only meaningful in LIVE mode for now.
    drillSubcategory: mode === "live" ? drillSubcategory : null,
  });

  // Whenever a fresh fetch arrives, drop the optimistic queue.
  useEffect(() => {
    setPendingSignals([]);
  }, [fetchedData?.generatedAt]);

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


  const isLive = mode === "live";
  const daysOfData = displayData?.dataSpan.daysOfData ?? 0;
  // PATTERN is always clickable. Sample size shows up in the subtitle
  // ("low sample" badge under 7d) so the user can interpret accordingly,
  // rather than the tab being silently locked.
  const patternUnlocked = true;
  const lowSample = daysOfData < 7;

  return (
    <div
      style={{
        width: "100vw",
        maxWidth: "100vw",
        // height (not min-height) so the inner middle wrapper with flex:1
        // gets a determinate parent and the Grid actually stretches to fill
        // the viewport. min-height collapses flex:1 children to content
        // size instead of distributing remaining space.
        height: "100vh",
        background: TOKENS.bg,
        color: TOKENS.text,
        fontFamily: TOKENS.font,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflowX: "hidden",
        boxSizing: "border-box",
      }}
    >
      <Header
        mode={mode}
        setMode={setMode}
        metric={metric}
        setMetric={setMetric}
        range={range}
        setRange={setRange}
        patternKind={patternKind}
        setPatternKind={setPatternKind}
        isLive={isLive}
        trackedCount={displayData?.trackedWhales ?? 0}
        lookbackDays={displayData?.lookbackDays ?? 30}
        patternUnlocked={patternUnlocked}
        daysOfData={daysOfData}
        lowSample={lowSample}
        onRequestLogin={() => setLoginOpen(true)}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: "14px 24px 10px",
          position: "relative",
          // Drill-mode (15-30 rows) might not fit a short viewport at the
          // 38px row min — let this wrapper scroll internally so the chrome
          // around it (header / stats bar / sign-in chip) stays visible.
          overflowY: "auto",
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
                    setPanelCell((prev) => (prev?.cellId === h.cellId ? null : h));
                    setWhaleProfileAddr(null);
                  }}
                  onRowClick={
                    // PATTERN doesn't support L3 (per-market) drill — bail
                    // out when we're already inside a category, otherwise the
                    // › chevron leads nowhere.
                    mode === "pattern" && displayData.drillCategory
                      ? undefined
                      : !displayData.drillCategory
                        ? (key) =>
                            isAuthed ? setDrillCategory(key as Category) : setLoginOpen(true)
                        : !displayData.drillSubcategory
                          ? (key) => (isAuthed ? setDrillSubcategory(key) : setLoginOpen(true))
                          : undefined
                  }
                  lockedCellId={panelCell?.cellId ?? null}
                  flashByCell={flashByCell}
                  gridKey={`${mode}-${range}-${patternKind}-${drillCategory ?? "top"}`}
                  savedOrder={rowOrder.get(scopeKey)}
                  onReorder={(next) => rowOrder.set(scopeKey, next)}
                  reorderEnabled={isAuthed}
                  onRequestLogin={() => setLoginOpen(true)}
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
                feed={{ entries: cellFeed.entries, loading: cellFeed.loading }}
                isAuthed={isAuthed}
                onRequestLogin={() => setLoginOpen(true)}
                // Clicking a whale row inside the cell panel pivots to that
                // whale's full drawer — close the cell panel so the two
                // right-side surfaces never stack. Stash the panel for
                // ← restore from the whale drawer.
                onWhaleClick={(addr) => {
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
            {hover && hover.cellId !== panelCell?.cellId && (
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
                isAuthed={isAuthed}
                onRequestLogin={() => setLoginOpen(true)}
                onWhaleClick={(addr) => setWhaleProfileAddr(addr)}
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
          onWhaleClick={(addr) => setWhaleProfileAddr(addr)}
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
