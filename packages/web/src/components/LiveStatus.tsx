"use client";

import { TOKENS } from "@/lib/tokens";
import { useLiveClock } from "@/lib/live-clock";

/**
 * Tiny status pill rendered next to the user chip — communicates SSE
 * freshness so the user can tell at a glance whether the firehose is
 * flowing. Reads from the singleton live-clock (no second EventSource).
 *
 *   fresh (<10s)   green pulsing dot · "live"
 *   warm  (<30s)   green dot         · "live · 8s"
 *   stale (<90s)   yellow dot        · "stale · 47s"
 *   dead  (≥90s)   red dot           · "no data · 2m"
 *   boot  (no data yet)               muted dot · "connecting"
 */
export function LiveStatus() {
  const { sinceMs, state } = useLiveClock();

  const palette: Record<typeof state, { dot: string; text: string; pulse: boolean }> = {
    boot:  { dot: TOKENS.textMuted, text: TOKENS.textMuted, pulse: false },
    fresh: { dot: TOKENS.pos,       text: TOKENS.textSec,   pulse: true  },
    warm:  { dot: TOKENS.pos,       text: TOKENS.textSec,   pulse: false },
    stale: { dot: TOKENS.accent,    text: TOKENS.accent,    pulse: false },
    dead:  { dot: TOKENS.neg,       text: TOKENS.neg,       pulse: false },
  };
  const { dot, text, pulse } = palette[state];

  const label =
    state === "boot"  ? "connecting" :
    state === "fresh" ? "live" :
                        `${state === "dead" ? "no data" : state} · ${fmtSince(sinceMs)}`;

  return (
    <div
      title={
        sinceMs === null
          ? "Waiting for first signal from the firehose"
          : `Last signal received ${fmtSince(sinceMs)} ago`
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 9px",
        borderRadius: 999,
        background: TOKENS.panel2,
        border: `1px solid ${TOKENS.border}`,
        fontSize: 10,
        fontFamily: TOKENS.mono,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        fontWeight: 700,
        color: text,
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: 6,
          background: dot,
          boxShadow: pulse ? `0 0 6px ${dot}` : "none",
          animation: pulse ? "liveStatusPulse 1.6s ease-in-out infinite" : undefined,
        }}
      />
      {label}
      <style>{`
        @keyframes liveStatusPulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.45; }
        }
      `}</style>
    </div>
  );
}

function fmtSince(ms: number | null): string {
  if (ms === null) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}
