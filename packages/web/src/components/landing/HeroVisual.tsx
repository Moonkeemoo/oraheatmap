"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { TOKENS } from "@/lib/tokens";

/**
 * Animated heatmap mock for the hero. Tells the actual product narrative
 * (not just "alive cells"):
 *
 *   1. A trade dot flies in from the left, lands on a target cell, the cell
 *      flashes brighter for ~1.5s, and a "+$X · Whale · BUY" callout pops
 *      pinned to that cell.
 *   2. Every ~12s a "convergence event" — 4 dots fly into the SAME cell in
 *      quick succession, then a "🐋×4 in 8s" badge lights up.
 *   3. A live counter top-right ticks up every time a trade lands —
 *      "Signals streamed since you opened: 14".
 *
 * Pure visual. Zero connection to real SSE; all events are scripted with
 * deterministic-ish randomness so the story plays out predictably while
 * still feeling alive. No external deps.
 */

const ROWS: ReadonlyArray<{ label: string; tilt: number }> = [
  { label: "POLITICS", tilt:  0.55 },
  { label: "SPORTS",   tilt: -0.35 },
  { label: "CRYPTO",   tilt:  0.20 },
  { label: "FINANCE",  tilt: -0.50 },
  { label: "TECH",     tilt:  0.15 },
  { label: "WORLD",    tilt:  0.40 },
  { label: "CULTURE",  tilt: -0.20 },
  { label: "CLIMATE",  tilt:  0.05 },
];
const COLS = 16;

function seedSigned(row: number, col: number): number {
  const tilt = ROWS[row]!.tilt;
  const recency = (col + 1) / COLS;
  const phase = Math.sin(row * 1.7 + col * 0.6) * 0.4;
  return Math.max(-1, Math.min(1, (tilt + phase) * (0.55 + recency * 0.45)));
}
function pnlColor(signed: number): { color: string; alpha: number } {
  const a = Math.abs(signed);
  if (a < 0.06) return { color: "#30363d", alpha: 0.35 };
  return { color: signed > 0 ? "#3fb950" : "#f85149", alpha: 0.22 + a * 0.7 };
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

/** Whale presets paired with the category they typically trade in and a few
 *  representative markets — gives the hero callout enough variety that
 *  reading two in a row already tells the story (different whales, different
 *  sides, different markets). cat indexes ROWS above. */
const WHALE_POOL: ReadonlyArray<{ alias: string; cat: number; markets: ReadonlyArray<string> }> = [
  { alias: "Theo4",         cat: 2, markets: ["BTC > $150k", "ETH < $2k", "SOL > $300"] },
  { alias: "@PrincessOfCo", cat: 0, markets: ["Trump 2028", "GOP Senate", "VP pick"] },
  { alias: "0xAce…f7",      cat: 1, markets: ["Lakers vs Celtics", "Bills vs Eagles", "Yankees ML"] },
  { alias: "@BetMaker",     cat: 3, markets: ["Fed rate cut", "Oil > $90", "USDJPY > 155"] },
  { alias: "GammaGod",      cat: 2, markets: ["BTC ATH by Q3", "ETH ETF flows", "XRP > $3"] },
  { alias: "@EVMaxi",       cat: 4, markets: ["AI bill passes", "OpenAI valuation", "TSMC > $200"] },
  { alias: "RoenickFan",    cat: 1, markets: ["Chelsea wins EPL", "Real Madrid UCL", "Lakers conf finals"] },
  { alias: "0xWhale99",     cat: 0, markets: ["Powell stays", "Election turnout", "SCOTUS ruling"] },
  { alias: "@SolEdge",      cat: 2, markets: ["SOL flips ETH?", "Memecoin season", "DEX volume Q2"] },
  { alias: "@DegenJury",    cat: 6, markets: ["Oscar Best Picture", "Grammy Album", "Eurovision winner"] },
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
};

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
      // "they're piling into THIS" reading. Use a whale that matches the
      // chosen row category for the seed market label.
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
        background: TOKENS.panel,
        border: `1px solid ${TOKENS.borderHi}`,
        borderRadius: 16,
        padding: 16,
        boxShadow: "0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(240, 180, 41, 0.06)",
        overflow: "hidden",
      }}
    >
      {/* fake header bar — mimics the app's chrome */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          paddingBottom: 10,
          borderBottom: `1px solid ${TOKENS.border}`,
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          {[TOKENS.neg, TOKENS.accent, TOKENS.pos].map((c) => (
            <span
              key={c}
              style={{ width: 10, height: 10, borderRadius: 10, background: c, opacity: 0.55 }}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: TOKENS.textMuted, fontFamily: TOKENS.mono, letterSpacing: 0.4, textTransform: "uppercase" }}>
            signals streamed: <strong style={{ color: TOKENS.text, fontVariantNumeric: "tabular-nums" }}>{state.counter}</strong>
          </span>
          <span
            style={{
              fontSize: 10,
              color: TOKENS.textMuted,
              fontFamily: TOKENS.mono,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            LIVE · 24h · PnL
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 6,
                background: TOKENS.pos,
                boxShadow: `0 0 10px ${TOKENS.pos}`,
                animation: "heroPulse 1.6s ease-in-out infinite",
              }}
            />
          </span>
        </div>
      </div>

      {/* heatmap grid — wraps in a positioning container so dots / callouts can overlay */}
      <div style={{ position: "relative" }} ref={null}>
        <Grid activeMap={activeMap} tick={tick} />
        <Inflight trades={state.inflight} />
        <Callout callout={state.callout} />
        <Convergence convergence={state.convergence} />
      </div>

      <style>{`
        @keyframes heroPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.45; transform: scale(0.85); }
        }
        @keyframes cellFlash {
          0%   { transform: scale(1);    box-shadow: 0 0 0 0 rgba(63,185,80,0.5); }
          40%  { transform: scale(1.18); box-shadow: 0 0 0 6px rgba(63,185,80,0.0); }
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
      `}</style>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────

function Grid({
  activeMap,
  tick,
}: {
  activeMap: Map<string, number>;
  tick: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `74px repeat(${COLS}, 1fr)`, gap: 3 }}>
      {ROWS.map((row, r) => (
        <Row key={row.label} row={r} tick={tick} activeMap={activeMap} />
      ))}
    </div>
  );
}

function Row({
  row,
  tick,
  activeMap,
}: {
  row: number;
  tick: number;
  activeMap: Map<string, number>;
}) {
  const r = ROWS[row]!;
  return (
    <>
      <div
        style={{
          background: TOKENS.panel2,
          color: TOKENS.textSec,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 0.6,
          padding: "0 8px",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          height: 28,
          border: `1px solid ${TOKENS.border}`,
        }}
      >
        {r.label}
      </div>
      {Array.from({ length: COLS }).map((_, c) => {
        const signed = seedSigned(row, c);
        const mag = Math.abs(signed);
        const pulse = (Math.sin((tick + row * 3 + c * 5) * 0.7) + 1) / 2;
        const { color, alpha } = pnlColor(signed);
        const adjusted = Math.min(1, alpha + pulse * mag * 0.12);
        const isActive = activeMap.has(`${row}:${c}`);
        return (
          <div
            key={c}
            data-cell={`${row}:${c}`}
            style={{
              height: 28,
              borderRadius: 3,
              background: color,
              opacity: isActive ? Math.min(1, alpha + 0.4) : adjusted,
              transition: "opacity .35s ease-out",
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

/** % position of a cell's CENTER within the inner content area (label col + data cells). */
function cellLeftPct(col: number): number {
  // 74px label col is small relative to total; approximate as 0.092 of width.
  const labelFrac = 74 / (74 + COLS * 60); // rough
  const dataFrac = 1 - labelFrac;
  const colFrac = (col + 0.5) / COLS;
  return (labelFrac + dataFrac * colFrac) * 100;
}
function cellTopPct(row: number): number {
  // Rows: 28px height + 3px gap; we have ROWS.length rows.
  const total = ROWS.length;
  return ((row + 0.5) / total) * 100;
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
              width: 12,
              height: 12,
              borderRadius: 12,
              background: accent,
              boxShadow: `0 0 12px ${accent}, 0 0 4px ${accent}`,
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
  const accent = callout.side === "BUY" ? TOKENS.pos : TOKENS.accent;
  return (
    <div
      style={{
        position: "absolute",
        left: `${left}%`,
        top: `${top}%`,
        transform: "translate(-50%, calc(-100% - 4px))",
        background: TOKENS.panel,
        border: `1px solid ${accent}`,
        borderRadius: 8,
        padding: "6px 10px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        whiteSpace: "nowrap",
        animation: "tipIn .25s ease-out forwards",
        pointerEvents: "none",
        zIndex: 4,
      }}
      key={`${callout.row}-${callout.col}-${callout.alias}-${callout.until}`}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontFamily: TOKENS.mono, letterSpacing: 0.4, textTransform: "uppercase", fontWeight: 700, color: TOKENS.textMuted }}>
        <span style={{ color: accent }}>{callout.side}</span>
        <span>·</span>
        <span style={{ color: TOKENS.text }}>{callout.usd}</span>
        <span>·</span>
        <span style={{ color: TOKENS.textSec }}>{ROWS[callout.row]?.label}</span>
      </div>
      <div style={{ fontSize: 12, color: TOKENS.text, fontWeight: 700, marginTop: 2 }}>{callout.alias}</div>
      <div style={{ fontSize: 10, color: TOKENS.textMuted, fontFamily: TOKENS.mono, marginTop: 1, maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={callout.market}>
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
