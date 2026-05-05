"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { TOKENS } from "@/lib/tokens";

/**
 * Animated heatmap mock for the hero. Designed to read as a real
 * screenshot of the product, not a generic "alive cells" loop:
 *
 *   - Header chrome mirrors the actual app — mode tab (LIVE | PATTERN),
 *     range chips (1h | 24h | 12d | 12w), metric chips (PNL | VOLUME |
 *     SIGNALS | WHALES), live status pill on the right.
 *   - Category labels carry their real palette colour from
 *     lib/categories.ts so a viewer instantly recognises the shape.
 *   - Cells are seeded with cluster patterns (a "hot streak" in Crypto
 *     col 11-14, a sustained dip in Finance, an evening spike in
 *     Sports), not a single sine wave — looks like real PnL data.
 *   - Trades fly in from the left, land on a cell that flashes, and
 *     pop a richer mini-tooltip styled like the real cell drawer
 *     header (4-stat row + whale + market label).
 *   - Convergence: 4 trades hit the same cell in succession → "🐋×N
 *     converging" badge lights up.
 *   - Bottom time strip with hourly-ish ticks and a NOW marker on the
 *     right edge so the sliding-window narrative reads at a glance.
 */

type RowDef = { label: string; color: string; tilt: number };

// Mirrors the categoryMeta palette in lib/categories.ts so the badge
// strip on the left reads as the real product, not a generic mock.
const ROWS: ReadonlyArray<RowDef> = [
  { label: "POLITICS", color: "#1f6feb", tilt:  0.55 },
  { label: "SPORTS",   color: "#f85149", tilt: -0.35 },
  { label: "CRYPTO",   color: "#f0b429", tilt:  0.25 },
  { label: "FINANCE",  color: "#39d2c0", tilt: -0.50 },
  { label: "TECH",     color: "#3fb950", tilt:  0.15 },
  { label: "WORLD",    color: "#58a6ff", tilt:  0.40 },
  { label: "CULTURE",  color: "#a371f7", tilt: -0.20 },
  { label: "CLIMATE",  color: "#768390", tilt:  0.05 },
];
const COLS = 18;

// Hot/cold cluster definitions per row. Each entry boosts a specific
// span of columns by a signed amount — gives the heatmap a "real data"
// shape (Politics rallying late, Sports dropping mid-window, Crypto
// recent rip, Finance bleeding throughout).
type Cluster = { from: number; to: number; boost: number };
const ROW_CLUSTERS: ReadonlyArray<ReadonlyArray<Cluster>> = [
  /* POLITICS */ [{ from: 8,  to: 17, boost:  0.55 }, { from: 14, to: 17, boost:  0.30 }],
  /* SPORTS   */ [{ from: 2,  to:  9, boost: -0.50 }, { from: 12, to: 17, boost: -0.35 }],
  /* CRYPTO   */ [{ from: 10, to: 15, boost:  0.50 }, { from: 16, to: 17, boost:  0.65 }],
  /* FINANCE  */ [{ from: 0,  to: 17, boost: -0.40 }, { from: 5,  to:  9, boost: -0.30 }],
  /* TECH     */ [{ from: 4,  to:  9, boost:  0.30 }, { from: 14, to: 17, boost: -0.40 }],
  /* WORLD    */ [{ from: 0,  to:  6, boost:  0.40 }, { from: 11, to: 15, boost:  0.35 }],
  /* CULTURE  */ [{ from: 6,  to: 13, boost: -0.45 }],
  /* CLIMATE  */ [{ from: 2,  to:  5, boost: -0.30 }, { from: 9,  to: 12, boost:  0.40 }],
];

function seedSigned(row: number, col: number): number {
  const tilt = ROWS[row]!.tilt;
  // Soft phase noise — keeps neighbouring cells from being identical.
  const phase = Math.sin(row * 1.7 + col * 0.6) * 0.18;
  let signed = tilt * 0.5 + phase;
  for (const cl of ROW_CLUSTERS[row] ?? []) {
    if (col >= cl.from && col <= cl.to) {
      // Smooth bell within the cluster span so the boost peaks in the middle.
      const t = (col - cl.from) / Math.max(1, cl.to - cl.from);
      const bell = 0.5 - 0.5 * Math.cos(t * Math.PI);
      signed += cl.boost * (0.35 + 0.65 * bell);
    }
  }
  return Math.max(-1, Math.min(1, signed));
}

function pnlColor(signed: number): { color: string; alpha: number } {
  const a = Math.abs(signed);
  if (a < 0.06) return { color: "#262d36", alpha: 0.55 };
  return { color: signed > 0 ? "#3fb950" : "#f85149", alpha: 0.18 + a * 0.78 };
}

type Trade = {
  id: number;
  row: number;
  col: number;
  alias: string;
  side: "BUY" | "SELL";
  usd: string;
  market: string;
  /** ms since mount when trade was scheduled to land. */
  landAt: number;
};

/** Whale presets paired with the category they typically trade in and a
 *  few representative markets. Reading two callouts in a row tells the
 *  story (different whale × side × market). cat indexes ROWS above. */
const WHALE_POOL: ReadonlyArray<{ alias: string; cat: number; markets: ReadonlyArray<string> }> = [
  { alias: "Theo4",         cat: 2, markets: ["BTC > $150k", "ETH ETF flows", "SOL > $300"] },
  { alias: "@PrincessOfCo", cat: 0, markets: ["Trump 2028", "GOP Senate", "VP pick by July"] },
  { alias: "0xAce…f7",      cat: 1, markets: ["Lakers vs Celtics", "Bills vs Eagles", "Yankees ML"] },
  { alias: "@BetMaker",     cat: 3, markets: ["Fed rate cut Sep", "Oil > $90", "USDJPY > 155"] },
  { alias: "GammaGod",      cat: 2, markets: ["BTC ATH by Q3", "ETH/BTC > 0.06", "XRP > $3"] },
  { alias: "@EVMaxi",       cat: 4, markets: ["AI Bill passes", "OpenAI valuation", "TSMC > $200"] },
  { alias: "RoenickFan",    cat: 1, markets: ["Chelsea wins EPL", "Real Madrid UCL", "Lakers conf"] },
  { alias: "0xWhale99",     cat: 0, markets: ["Powell stays", "Election turnout > 70%", "SCOTUS ruling"] },
  { alias: "@SolEdge",      cat: 2, markets: ["SOL flips ETH?", "Memecoin season", "DEX volume Q2"] },
  { alias: "@DegenJury",    cat: 6, markets: ["Oscar Best Picture", "Grammy Album", "Eurovision"] },
  { alias: "ClimateBro",    cat: 7, markets: ["NYC > 25°C Fri", "Hurricane landfall", "Arctic ice min"] },
  { alias: "GeoWhale",      cat: 5, markets: ["UK election", "Brazil presidency", "EU summit deal"] },
];

const USD_OPTIONS = ["$8.4k", "$22k", "$48k", "$84k", "$120k", "$210k", "$310k", "$540k"];

let nextId = 1;
function newRandomTrade(now: number): Trade {
  const sample = WHALE_POOL[Math.floor(Math.random() * WHALE_POOL.length)]!;
  // Trades skew to recent columns — the "now" edge.
  const col = COLS - 1 - Math.floor(Math.random() * 4);
  return {
    id: nextId++,
    row: sample.cat,
    col,
    alias: sample.alias,
    side: Math.random() > 0.35 ? "BUY" : "SELL",
    usd: USD_OPTIONS[Math.floor(Math.random() * USD_OPTIONS.length)]!,
    market: sample.markets[Math.floor(Math.random() * sample.markets.length)]!,
    landAt: now + 1100, // 1.1s flight time
  };
}

type State = {
  inflight: ReadonlyArray<Trade>;
  active: ReadonlyArray<{ row: number; col: number; until: number }>;
  callout: {
    row: number;
    col: number;
    alias: string;
    side: "BUY" | "SELL";
    usd: string;
    market: string;
    until: number;
  } | null;
  convergence: { row: number; col: number; count: number; until: number } | null;
  counter: number;
  /** Accumulated PnL-shift per cell driven by landed trades. Each BUY
   *  bumps the cell signed by +SHIFT, each SELL by -SHIFT. Persists
   *  for the lifetime of the mount so the heatmap visibly drifts as
   *  trades flow in (just like the real product). Keyed "${row}:${col}". */
  cellShift: Readonly<Record<string, number>>;
};

/** How much one trade nudges its target cell's signed value. BUY pulls
 *  toward green, SELL toward red. Combined with the seeded background
 *  via Math.max/Math.min(±1) in the renderer. */
const TRADE_SHIFT = 0.22;

type Action =
  | { type: "schedule"; trade: Trade }
  | { type: "land"; trade: Trade; now: number }
  | { type: "convergeStart"; row: number; col: number; now: number }
  | { type: "convergeBump"; now: number }
  | { type: "convergeEnd"; until: number }
  | { type: "tick"; now: number };

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "schedule":
      return { ...state, inflight: [...state.inflight, action.trade] };
    case "land": {
      const cellUntil = action.now + 1500;
      const cellKey = `${action.trade.row}:${action.trade.col}`;
      const delta = action.trade.side === "BUY" ? TRADE_SHIFT : -TRADE_SHIFT;
      const prev = state.cellShift[cellKey] ?? 0;
      const next = Math.max(-1, Math.min(1, prev + delta));
      return {
        ...state,
        inflight: state.inflight.filter((t) => t.id !== action.trade.id),
        active: [...state.active, { row: action.trade.row, col: action.trade.col, until: cellUntil }],
        callout: {
          row: action.trade.row,
          col: action.trade.col,
          alias: action.trade.alias,
          side: action.trade.side,
          usd: action.trade.usd,
          market: action.trade.market,
          until: action.now + 2400,
        },
        counter: state.counter + 1,
        cellShift: { ...state.cellShift, [cellKey]: next },
      };
    }
    case "convergeStart":
      return { ...state, convergence: { row: action.row, col: action.col, count: 1, until: action.now + 9000 } };
    case "convergeBump":
      return state.convergence
        ? { ...state, convergence: { ...state.convergence, count: state.convergence.count + 1, until: action.now + 9000 } }
        : state;
    case "convergeEnd":
      return state.convergence ? { ...state, convergence: { ...state.convergence, until: action.until } } : state;
    case "tick": {
      const now = action.now;
      return {
        ...state,
        active: state.active.filter((a) => a.until > now),
        callout: state.callout && state.callout.until > now ? state.callout : null,
        convergence: state.convergence && state.convergence.until > now ? state.convergence : null,
      };
    }
  }
}

export function HeroVisual() {
  const [state, dispatch] = useReducer(reduce, {
    inflight: [],
    active: [],
    callout: null,
    convergence: null,
    counter: 0,
    cellShift: {},
  });
  const [tick, setTick] = useState(0);
  const startedAt = useRef<number>(0);
  if (startedAt.current === 0) startedAt.current = typeof window !== "undefined" ? Date.now() : 0;

  // Frame-ish tick — drives cell pulse + GC of expired animations.
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => (t + 1) % 10000);
      dispatch({ type: "tick", now: Date.now() });
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Scheduler — kicks off random trades and the occasional convergence event.
  useEffect(() => {
    let cancelled = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let convergeTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleNextTrade() {
      if (cancelled) return;
      const t = newRandomTrade(Date.now());
      dispatch({ type: "schedule", trade: t });
      // Land after flight time.
      setTimeout(() => {
        if (cancelled) return;
        dispatch({ type: "land", trade: t, now: Date.now() });
      }, 1100);
      const gap = 900 + Math.random() * 1700;
      idleTimer = setTimeout(scheduleNextTrade, gap);
    }

    function scheduleConvergence() {
      if (cancelled) return;
      // Pick a target cell; fire 4 trades into it in quick succession.
      const row = Math.floor(Math.random() * ROWS.length);
      const col = COLS - 1 - Math.floor(Math.random() * 3);
      dispatch({ type: "convergeStart", row, col, now: Date.now() });
      // Pick a single market the convergence forms around — bumps the
      // "they're piling into THIS" reading.
      const seedWhale = WHALE_POOL.find((w) => w.cat === row) ?? WHALE_POOL[0]!;
      const market = seedWhale.markets[Math.floor(Math.random() * seedWhale.markets.length)]!;
      const aliases: ReadonlyArray<string> = ["Theo4", "@PrincessOfCo", "GammaGod", "0xWhale99"];
      aliases.forEach((alias, i) => {
        setTimeout(() => {
          if (cancelled) return;
          const trade: Trade = {
            id: nextId++,
            row,
            col,
            alias,
            side: "BUY",
            usd: USD_OPTIONS[2 + (i % 3)]!,
            market,
            landAt: Date.now() + 1100,
          };
          dispatch({ type: "schedule", trade });
          setTimeout(() => {
            if (cancelled) return;
            dispatch({ type: "land", trade, now: Date.now() });
            dispatch({ type: "convergeBump", now: Date.now() });
          }, 1100);
        }, i * 700);
      });
      // Re-trigger every 14–18s.
      convergeTimer = setTimeout(scheduleConvergence, 14000 + Math.random() * 4000);
    }

    // Stagger initial start so the page has a quiet half-second after load.
    idleTimer = setTimeout(scheduleNextTrade, 700);
    convergeTimer = setTimeout(scheduleConvergence, 6000);
    return () => {
      cancelled = true;
      if (idleTimer) clearTimeout(idleTimer);
      if (convergeTimer) clearTimeout(convergeTimer);
    };
  }, []);

  const activeMap = new Map<string, number>();
  state.active.forEach((a) => activeMap.set(`${a.row}:${a.col}`, a.until));

  return (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        background: "linear-gradient(180deg, #14181d 0%, #0d1117 100%)",
        border: `1px solid ${TOKENS.borderHi}`,
        borderRadius: 14,
        padding: "12px 14px 16px",
        boxShadow:
          "0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(240, 180, 41, 0.06), inset 0 1px 0 rgba(255,255,255,0.02)",
        overflow: "hidden",
      }}
    >
      {/* App-chrome header — traffic-light dots, mode tabs, status pill. */}
      <AppChrome counter={state.counter} />

      {/* Tab strip — looks like the real app's range/metric controls. */}
      <TabStrip />

      {/* heatmap grid — wraps in a positioning container so dots / callouts can overlay */}
      <div style={{ position: "relative", marginTop: 10 }}>
        <Grid activeMap={activeMap} tick={tick} cellShift={state.cellShift} />
        <NowLine />
        <PulseTracers trades={state.inflight} />
        <Inflight trades={state.inflight} />
        <Callout callout={state.callout} />
        <Convergence convergence={state.convergence} />
      </div>

      {/* Bottom time-strip — anchors the sliding-window narrative. */}
      <TimeStrip />

      <style>{`
        @keyframes heroPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.45; transform: scale(0.85); }
        }
        @keyframes cellFlash {
          0%   { transform: scale(1);    box-shadow: 0 0 0 0 rgba(63,185,80,0.55); }
          40%  { transform: scale(1.16); box-shadow: 0 0 0 6px rgba(63,185,80,0.0); }
          100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(63,185,80,0); }
        }
        @keyframes tipIn {
          from { opacity: 0; transform: translate(-50%, calc(-100% - 14px)) scale(0.96); }
          to   { opacity: 1; transform: translate(-50%, calc(-100% - 4px))  scale(1);    }
        }
        @keyframes flyIn {
          from { left: -8%;  opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
          5%   { opacity: 1;  transform: translate(-50%, -50%) scale(1); }
          95%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          to   { opacity: 0;  transform: translate(-50%, -50%) scale(1.25); }
        }
        @keyframes convergePulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(240,180,41,0.45); }
          50%      { transform: scale(1.04); box-shadow: 0 0 0 8px rgba(240,180,41,0); }
        }
        @keyframes nowLinePulse {
          0%, 100% { opacity: 0.65; }
          50%      { opacity: 0.95; }
        }
        @keyframes tracerSweep {
          /* Tracer "grows" from a zero-length point at the left edge to
             its full row-anchor width — the bright head appears to fly
             rightward along the row while a soft tail trails behind. */
          0%   { transform: translateY(-50%) scaleX(0);   opacity: 0;    }
          12%  { opacity: 0.95; }
          88%  { opacity: 0.85; }
          100% { transform: translateY(-50%) scaleX(1);   opacity: 0;    }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function AppChrome({ counter }: { counter: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
        paddingBottom: 10,
        borderBottom: `1px solid ${TOKENS.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[TOKENS.neg, TOKENS.accent, TOKENS.pos].map((c) => (
            <span
              key={c}
              style={{ width: 9, height: 9, borderRadius: 9, background: c, opacity: 0.55 }}
            />
          ))}
        </div>
        {/* "App-style" mode toggle — LIVE active. */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 6 }}>
          <span
            style={{
              fontSize: 9,
              padding: "3px 8px",
              borderRadius: 4,
              background: TOKENS.panel2,
              border: `1px solid ${TOKENS.borderHi}`,
              color: TOKENS.text,
              fontFamily: TOKENS.mono,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 6,
                background: TOKENS.pos,
                boxShadow: `0 0 6px ${TOKENS.pos}`,
              }}
            />
            LIVE
          </span>
          <span
            style={{
              fontSize: 9,
              padding: "3px 8px",
              borderRadius: 4,
              background: "transparent",
              color: TOKENS.textMuted,
              fontFamily: TOKENS.mono,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            PATTERN
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <span
          style={{
            fontSize: 9,
            color: TOKENS.textMuted,
            fontFamily: TOKENS.mono,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          signals streamed{" "}
          <strong
            style={{
              color: TOKENS.text,
              fontVariantNumeric: "tabular-nums",
              marginLeft: 4,
              fontSize: 11,
            }}
          >
            {counter}
          </strong>
        </span>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 8,
            background: TOKENS.pos,
            boxShadow: `0 0 12px ${TOKENS.pos}`,
            animation: "heroPulse 1.6s ease-in-out infinite",
          }}
        />
      </div>
    </div>
  );
}

function TabStrip() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontSize: 9,
        fontFamily: TOKENS.mono,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        fontWeight: 700,
      }}
    >
      <ChipGroup items={["1H", "24H", "12D", "12W"]} active="24H" />
      <span style={{ width: 1, height: 14, background: TOKENS.border }} />
      <ChipGroup items={["PNL", "VOLUME", "SIGNALS", "WHALES"]} active="PNL" />
    </div>
  );
}

function ChipGroup({ items, active }: { items: ReadonlyArray<string>; active: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      {items.map((label) => {
        const isActive = label === active;
        return (
          <span
            key={label}
            style={{
              padding: "3px 7px",
              borderRadius: 4,
              background: isActive ? TOKENS.panel2 : "transparent",
              color: isActive ? TOKENS.text : TOKENS.textMuted,
              border: isActive ? `1px solid ${TOKENS.border}` : "1px solid transparent",
            }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function Grid({
  activeMap,
  tick,
  cellShift,
}: {
  activeMap: Map<string, number>;
  tick: number;
  cellShift: Readonly<Record<string, number>>;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `78px repeat(${COLS}, 1fr)`, gap: 3 }}>
      {ROWS.map((row, r) => (
        <Row key={row.label} row={r} tick={tick} activeMap={activeMap} cellShift={cellShift} />
      ))}
    </div>
  );
}

function Row({
  row,
  tick,
  activeMap,
  cellShift,
}: {
  row: number;
  tick: number;
  activeMap: Map<string, number>;
  cellShift: Readonly<Record<string, number>>;
}) {
  const r = ROWS[row]!;
  return (
    <>
      {/* Category badge — coloured square + label. Mirrors the real app. */}
      <div
        style={{
          background: TOKENS.panel2,
          border: `1px solid ${TOKENS.border}`,
          color: TOKENS.textSec,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 0.6,
          padding: "0 8px",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          gap: 7,
          height: 26,
          fontFamily: TOKENS.font,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 2,
            background: r.color,
            boxShadow: `0 0 5px ${r.color}66`,
            flexShrink: 0,
          }}
        />
        <span style={{ color: TOKENS.text }}>{r.label}</span>
      </div>
      {Array.from({ length: COLS }).map((_, c) => {
        const cellKey = `${row}:${c}`;
        // Apply landed-trade nudges on top of the seeded baseline so
        // the cell's actual colour shifts as BUYs/SELLs come in. Clamp
        // to [-1, 1] — trade shifts can otherwise stack past the
        // saturation point of the colour ramp.
        const baseline = seedSigned(row, c);
        const shift = cellShift[cellKey] ?? 0;
        const signed = Math.max(-1, Math.min(1, baseline + shift));
        const mag = Math.abs(signed);
        const pulse = (Math.sin((tick + row * 3 + c * 5) * 0.7) + 1) / 2;
        const { color, alpha } = pnlColor(signed);
        const adjusted = Math.min(1, alpha + pulse * mag * 0.1);
        const isActive = activeMap.has(cellKey);
        return (
          <div
            key={c}
            data-cell={cellKey}
            style={{
              height: 26,
              borderRadius: 3,
              background: color,
              opacity: isActive ? Math.min(1, alpha + 0.4) : adjusted,
              // Slight delay on the colour transition so the user can
              // perceive "trade landed → cell flashed → cell shifted
              // hue" as three distinct beats rather than one blur.
              transition: "background .55s ease-out, opacity .35s ease-out",
              animation: isActive ? "cellFlash 1.1s ease-out" : undefined,
              outline: isActive ? `1.5px solid ${TOKENS.pos}` : undefined,
              outlineOffset: -1,
              position: "relative",
              zIndex: isActive ? 2 : 0,
            }}
          />
        );
      })}
    </>
  );
}

function NowLine() {
  // Vertical accent line on the rightmost column edge — communicates
  // "this is the NOW boundary, the grid scrolls left as time advances".
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: -2,
        bottom: -2,
        right: `calc((100% - 78px - 3px) / ${COLS} / 2)`,
        transform: "translateX(50%)",
        width: 1.5,
        background: `linear-gradient(180deg, transparent 0%, ${TOKENS.accent} 25%, ${TOKENS.accent} 75%, transparent 100%)`,
        opacity: 0.65,
        pointerEvents: "none",
        animation: "nowLinePulse 2s ease-in-out infinite",
        boxShadow: `0 0 6px ${TOKENS.accent}88`,
      }}
    />
  );
}

function TimeStrip() {
  // Time anchors along the bottom — sparser than the column grid so
  // they don't crowd. "now" sits on the right edge, accent-coloured.
  // Positions are computed off the same column geometry as the grid.
  const ticks: ReadonlyArray<{ col: number; label: string }> = [
    { col: 0,  label: "−21h" },
    { col: 5,  label: "−16h" },
    { col: 9,  label: "−10h" },
    { col: 13, label: "−4h" },
    { col: 17, label: "now" },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `78px repeat(${COLS}, 1fr)`,
        gap: 3,
        marginTop: 8,
        fontSize: 8,
        fontFamily: TOKENS.mono,
        color: TOKENS.textMuted,
        letterSpacing: 0.5,
      }}
    >
      <span />
      {Array.from({ length: COLS }).map((_, c) => {
        const tick = ticks.find((t) => t.col === c);
        if (!tick) return <span key={c} />;
        return (
          <span
            key={c}
            style={{
              textAlign: "center",
              color: tick.label === "now" ? TOKENS.accent : TOKENS.textMuted,
              fontWeight: tick.label === "now" ? 700 : 500,
            }}
          >
            {tick.label}
          </span>
        );
      })}
    </div>
  );
}

/** % position of a cell's CENTER within the inner content area (label col + data cells). */
function cellLeftPct(col: number): number {
  // 78px label col is small relative to total; approximate as 0.10 of width.
  const labelFrac = 78 / (78 + COLS * 60); // rough
  const dataFrac = 1 - labelFrac;
  const colFrac = (col + 0.5) / COLS;
  return (labelFrac + dataFrac * colFrac) * 100;
}
function cellTopPct(row: number): number {
  // Rows: 26px height + 3px gap; we have ROWS.length rows.
  const total = ROWS.length;
  return ((row + 0.5) / total) * 100;
}

/** Hair-thin horizontal tracer streak that runs from the left edge of
 *  the data area to the target cell along the row. Looks like a
 *  data packet on a wire — adds a sense of "the signal is travelling
 *  to its destination", which the dot alone doesn't quite convey.
 *  Uses a short bright gradient as the leading edge with a soft tail
 *  fading out behind it. The whole element is animated via a single
 *  CSS keyframe `tracerSweep` so it costs almost nothing to render. */
function PulseTracers({ trades }: { trades: ReadonlyArray<Trade> }) {
  // The data area starts at 78px (label column) + 3px gap.
  // Use the same cellLeftPct math so the head lines up with the dot.
  return (
    <>
      {trades.map((t) => {
        const headLeft = cellLeftPct(t.col); // % of total width — where the streak should peak
        const top = cellTopPct(t.row);
        const accent = t.side === "BUY" ? TOKENS.pos : TOKENS.neg;
        return (
          <div
            key={`tr-${t.id}`}
            aria-hidden="true"
            style={{
              position: "absolute",
              top: `${top}%`,
              left: 0,
              width: `${headLeft}%`,
              height: 1,
              transform: "translateY(-50%)",
              // Long fading tail on the left, brightest "head" on the right
              // — when the element grows in width, the head appears to
              // travel rightward.
              background: `linear-gradient(90deg,
                transparent 0%,
                ${accent}00 40%,
                ${accent}66 80%,
                ${accent}ee 96%,
                #fff 100%)`,
              boxShadow: `0 0 6px ${accent}, 0 0 2px ${accent}`,
              filter: "blur(0.3px)",
              animation: "tracerSweep 1.1s linear forwards",
              transformOrigin: "right center",
              pointerEvents: "none",
              zIndex: 2,
              opacity: 0.85,
            }}
          />
        );
      })}
    </>
  );
}

function Inflight({ trades }: { trades: ReadonlyArray<Trade> }) {
  return (
    <>
      {trades.map((t) => {
        const left = cellLeftPct(t.col);
        const top = cellTopPct(t.row);
        const accent = t.side === "BUY" ? TOKENS.pos : TOKENS.neg;
        return (
          <div
            key={t.id}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: 11,
              height: 11,
              borderRadius: 11,
              background: accent,
              boxShadow: `0 0 14px ${accent}, 0 0 4px ${accent}`,
              transform: "translate(-50%, -50%)",
              animation: "flyIn 1.1s linear forwards",
              pointerEvents: "none",
              zIndex: 3,
            }}
          />
        );
      })}
    </>
  );
}

function Callout({
  callout,
}: {
  callout: State["callout"];
}) {
  if (!callout) return null;
  const left = cellLeftPct(callout.col);
  const top = cellTopPct(callout.row);
  const accent = callout.side === "BUY" ? TOKENS.pos : TOKENS.neg;
  const row = ROWS[callout.row]!;
  // Synthetic stat values for the mini grid — not real, but consistent
  // shape (4 cells: TRADES, PNL, VOLUME, WIN%) that mirrors the actual
  // app's cell-tooltip header.
  const fakeStats = synthCellStats(callout.row, callout.col, callout.side, callout.usd);
  return (
    <div
      style={{
        position: "absolute",
        left: `${left}%`,
        top: `${top}%`,
        transform: "translate(-50%, calc(-100% - 4px))",
        background: TOKENS.panel,
        border: `1px solid ${accent}`,
        borderRadius: 10,
        padding: "8px 12px 10px",
        boxShadow: "0 18px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.4)",
        whiteSpace: "nowrap",
        animation: "tipIn .25s ease-out forwards",
        pointerEvents: "none",
        zIndex: 4,
        minWidth: 220,
      }}
      key={`${callout.row}-${callout.col}-${callout.alias}-${callout.until}`}
    >
      {/* Header strip — category chip + side badge + USD + slot label. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingBottom: 6,
          borderBottom: `1px solid ${TOKENS.border}`,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            background: row.color,
            color: "#fff",
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: 0.4,
            padding: "2px 6px",
            borderRadius: 3,
            textTransform: "uppercase",
            fontFamily: TOKENS.mono,
          }}
        >
          {row.label}
        </span>
        <span
          style={{
            fontSize: 9,
            color: accent,
            fontWeight: 800,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            fontFamily: TOKENS.mono,
          }}
        >
          {callout.side}
        </span>
        <span style={{ fontSize: 11, color: TOKENS.text, fontWeight: 700, fontFamily: TOKENS.mono }}>
          {callout.usd}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: TOKENS.textMuted, fontFamily: TOKENS.mono }}>now</span>
      </div>
      {/* 4-stat micro-grid — looks like the real cell-tooltip header. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <MicroStat label="TRADES" value={fakeStats.trades} />
        <MicroStat
          label="PNL"
          value={fakeStats.pnl}
          color={fakeStats.pnlPositive ? TOKENS.pos : TOKENS.neg}
        />
        <MicroStat label="VOL" value={fakeStats.vol} />
        <MicroStat
          label="WIN"
          value={fakeStats.win}
          color={fakeStats.winRate >= 0.5 ? TOKENS.pos : TOKENS.neg}
        />
      </div>
      {/* Whale line + market label. */}
      <div style={{ fontSize: 11, color: TOKENS.text, fontWeight: 700, marginBottom: 1 }}>
        {callout.alias}
      </div>
      <div
        style={{
          fontSize: 10,
          color: TOKENS.textSec,
          fontFamily: TOKENS.mono,
          maxWidth: 240,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={callout.market}
      >
        {callout.market}
      </div>
      {/* tail */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: -5,
          transform: "translateX(-50%) rotate(45deg)",
          width: 8,
          height: 8,
          background: TOKENS.panel,
          border: `1px solid ${accent}`,
          borderTop: "none",
          borderLeft: "none",
        }}
      />
    </div>
  );
}

function MicroStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span
        style={{
          fontSize: 7.5,
          fontFamily: TOKENS.mono,
          color: TOKENS.textMuted,
          letterSpacing: 0.5,
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 11,
          fontFamily: TOKENS.mono,
          color: color ?? TOKENS.text,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** Synthesised stat values for the callout's micro-grid. Deterministic
 *  per (row, col, side, usd) so consecutive frames don't shimmer. Not
 *  real data — purpose-built to look credible alongside the cell that
 *  just flashed. */
function synthCellStats(
  row: number,
  col: number,
  side: "BUY" | "SELL",
  usd: string,
): {
  trades: string;
  pnl: string;
  pnlPositive: boolean;
  vol: string;
  win: string;
  winRate: number;
} {
  const seed = row * 17 + col * 31 + side.charCodeAt(0);
  const tradeCount = 18 + (seed % 80);
  // PnL leans positive on BUY-led cells, negative on SELL-led.
  const pnlSigned = (side === "BUY" ? 1 : -1) * (12 + (seed % 70)) * 1000;
  const pnlPositive = pnlSigned > 0;
  const volume = 180 + (seed % 320);
  const winCount = 8 + (seed % 12);
  const lossCount = 3 + (seed % 7);
  const winRate = winCount / (winCount + lossCount);
  return {
    trades: String(tradeCount),
    pnl: `${pnlSigned >= 0 ? "+" : "−"}$${(Math.abs(pnlSigned) / 1000).toFixed(0)}k`,
    pnlPositive,
    vol: `$${volume}k`,
    win: `${Math.round(winRate * 100)}%`,
    winRate,
  };
}

function Convergence({
  convergence,
}: {
  convergence: State["convergence"];
}) {
  if (!convergence) return null;
  const left = cellLeftPct(convergence.col);
  const top = cellTopPct(convergence.row);
  if (convergence.count < 2) return null; // wait until we have at least 2 hits
  return (
    <div
      style={{
        position: "absolute",
        left: `${left}%`,
        top: `${top}%`,
        transform: "translate(-50%, calc(100% + 6px))",
        background: TOKENS.accent,
        color: "#1a1410",
        borderRadius: 999,
        padding: "4px 10px",
        fontSize: 10,
        fontWeight: 800,
        fontFamily: TOKENS.mono,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        boxShadow: "0 6px 18px rgba(240,180,41,0.45)",
        animation: "convergePulse 1.2s ease-in-out infinite",
        pointerEvents: "none",
        zIndex: 4,
        whiteSpace: "nowrap",
      }}
    >
      🐋×{convergence.count} converging
    </div>
  );
}
