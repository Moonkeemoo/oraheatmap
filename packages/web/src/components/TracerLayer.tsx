"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TOKENS } from "@/lib/tokens";

/**
 * Live-signal tracer layer — for each SSE signal that lands on a visible
 * cell, draws a hair-thin streak that flies from the left edge of the
 * data area along the cell's row to the cell's centre. Reads as "the
 * signal travelled to its destination" and reinforces the live feed
 * narrative. Decays after the flight completes.
 *
 * Coords are computed by querying the matching cell's DOM rect on
 * mount, so we don't have to thread layout numbers through Grid. If
 * the cell isn't in the DOM (drilled out, scrolled off), the tracer
 * silently no-ops.
 */
export type TracerEvent = {
  id: number;
  /** `${rowKey}:${originalSlotIdx}` — same key shape Heatmap uses for
   *  flashByCell, so callers can fire both flash + tracer with one key. */
  cellKey: string;
  side: "BUY" | "SELL" | "SETTLEMENT";
};

const FLIGHT_MS = 700;

export function TracerLayer({
  events,
  onDone,
}: {
  events: ReadonlyArray<TracerEvent>;
  onDone: (id: number) => void;
}) {
  return (
    <>
      {events.map((e) => (
        <Tracer key={e.id} event={e} onDone={() => onDone(e.id)} />
      ))}
      <style>{`
        @keyframes tracerFly {
          /* origin: left center → scaleX(0) is a point at the left edge.
             As it grows to scaleX(1), the right edge (where the bright
             head sits in the gradient) appears to fly rightward. */
          0%   { transform: scaleX(0) translateY(-50%); opacity: 0; }
          12%  { opacity: 1; }
          88%  { opacity: 1; }
          100% { transform: scaleX(1) translateY(-50%); opacity: 0; }
        }
      `}</style>
    </>
  );
}

function Tracer({ event, onDone }: { event: TracerEvent; onDone: () => void }) {
  const [geom, setGeom] = useState<{
    left: number;
    width: number;
    top: number;
    color: string;
  } | null>(null);
  const settled = useRef(false);

  useLayoutEffect(() => {
    if (settled.current) return;
    settled.current = true;
    // Find the cell that this tracer should land on, and the grid wrap
    // it lives inside. The wrap doubles as our positioning parent
    // (TracerLayer is rendered as a child of it).
    const cellEl = document.querySelector<HTMLElement>(
      `[data-tracer-cell="${cssEscape(event.cellKey)}"]`,
    );
    const wrapEl = cellEl?.closest("[data-hm-grid-wrap]") as HTMLElement | null;
    if (!cellEl || !wrapEl) {
      // Cell is off-screen / not in this grid render — skip the tracer.
      onDone();
      return;
    }
    const cr = cellEl.getBoundingClientRect();
    const wr = wrapEl.getBoundingClientRect();

    // Find the leftmost data cell in this row to anchor the streak's
    // start point. Falls back to the cell's own row position if we
    // can't locate row siblings.
    const rowKey = event.cellKey.split(":")[0]!;
    let dataAreaLeft = cr.left;
    const rowFirst = wrapEl.querySelector<HTMLElement>(
      `[data-tracer-cell^="${cssEscape(rowKey)}:"]`,
    );
    if (rowFirst) dataAreaLeft = rowFirst.getBoundingClientRect().left;

    const left = dataAreaLeft - wr.left;
    const cellCenter = cr.left + cr.width / 2 - wr.left;
    const width = Math.max(0, cellCenter - left);
    const top = cr.top + cr.height / 2 - wr.top;

    const color =
      event.side === "BUY"
        ? TOKENS.pos
        : event.side === "SELL"
          ? TOKENS.neg
          : TOKENS.textMuted;

    setGeom({ left, width, top, color });
  }, [event.cellKey, event.side, onDone]);

  // Auto-cleanup after the flight finishes.
  useEffect(() => {
    const t = setTimeout(onDone, FLIGHT_MS + 50);
    return () => clearTimeout(t);
  }, [onDone]);

  if (!geom) return null;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: geom.left,
        top: geom.top,
        width: geom.width,
        height: 2,
        // Gradient bright at right (the leading head) → fading to
        // transparent on the left (the tail). Combined with the scaleX
        // 0→1 from origin:left, the head appears to fly rightward.
        background: `linear-gradient(90deg,
          transparent 0%,
          ${geom.color}00 30%,
          ${geom.color}55 65%,
          ${geom.color}cc 88%,
          ${geom.color}ff 96%,
          rgba(255,255,255,0.95) 100%)`,
        boxShadow: `0 0 6px ${geom.color}aa, 0 0 2px ${geom.color}`,
        filter: "blur(0.3px)",
        transformOrigin: "left center",
        transform: "scaleX(0) translateY(-50%)",
        animation: `tracerFly ${FLIGHT_MS}ms cubic-bezier(.4,.05,.25,1) forwards`,
        pointerEvents: "none",
        zIndex: 4,
        willChange: "transform, opacity",
      }}
    />
  );
}

/** Minimal CSS.escape polyfill — keeps the data attribute selector safe
 *  for keys that contain colons (which we use as row:slot separators). */
function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}
