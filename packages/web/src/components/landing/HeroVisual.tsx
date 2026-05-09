"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hero visual — port of `marketing-assets/marketing-demo.html` into a
 * React component. Self-contained 18s loop that tells the product story
 * in 5 phases: wave fill (0–3s) → row sweeps (3–6s) → col sweeps + dense
 * pulses (6–9s) → whale callouts with screen-flash (9–13.5s) → cooldown
 * (13.5–18s). Composite alpha colour formula matches `lib/colors.ts`.
 *
 * Implementation: cells are imperative DOM (refs + classList) instead of
 * React state, so 672 cells × ~60fps doesn't thrash reconciliation. Tape
 * ticker is built on mount inside useEffect to dodge SSR/CSR hydration
 * mismatch from Math.random.
 */

// Local marketing palette — slightly off the app TOKENS so the hero
// reads as its own stylized artifact (deeper greens, brighter whites).
const T = {
  bg: "#0a0d12",
  base: "#0e1218",
  line: "#1a2030",
  text: "#e6eef7",
  textDim: "#6b7a8f",
  textMid: "#9aa8bd",
  win: "#3fb950",
  winText: "#dcffe2",
  loss: "#f85149",
  lossText: "#ffe2e0",
} as const;

const COLS = 84;
const ROWS = 8;
const TODAY_COL_START = 77; // last week tinted (last 7 of 84 cols)
const LOOP_MS = 18_000;

const CATS: ReadonlyArray<string> = [
  "POLITICS",
  "SPORTS",
  "CRYPTO",
  "FINANCE",
  "TECH",
  "WORLD",
  "CULTURE",
  "CLIMATE",
];

// 12-week timeline header — labelless except for the rightmost "Now"
// indicator. The week-labels were noisy and didn't add information
// (the heatmap is the data; the header is just a temporal anchor).
const WEEK_TICKS = 12;

const WHALE_NAMES: ReadonlyArray<string> = [
  "Theo4", "0xAce…f7", "GammaGod", "@PrincessOfCo",
  "@BetMaker", "@EVMaxi", "RoenickFan", "0xWhale99",
  "@SolEdge", "@DegenJury",
];

// Composite (R,G,B,a) over base #0e1218. Mirrors the alpha formula in
// /lib/colors.ts so the heatmap hero reads in the same colour space as
// the real product.
function pnlBg(v: number): string {
  const intensity = Math.abs(v);
  if (intensity < 0.04) return "rgb(14,18,24)";
  const isPos = v > 0;
  const a = 0.08 + Math.pow(intensity, 0.7) * 0.77;
  const baseR = 0x0e, baseG = 0x12, baseB = 0x18;
  const colR = isPos ? 63 : 248;
  const colG = isPos ? 185 : 81;
  const colB = isPos ? 80 : 73;
  const r = Math.round(colR * a + baseR * (1 - a));
  const g = Math.round(colG * a + baseG * (1 - a));
  const b = Math.round(colB * a + baseB * (1 - a));
  return `rgb(${r},${g},${b})`;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const irand = (n: number) => Math.floor(Math.random() * n);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type AnimEvent =
  | { at: number; kind: "set"; r: number; c: number; value: number }
  | { at: number; kind: "pulse"; r: number; c: number; soft?: boolean }
  | { at: number; kind: "flicker"; r: number; c: number }
  | { at: number; kind: "row-sweep"; r: number }
  | { at: number; kind: "col-sweep"; c: number }
  | { at: number; kind: "whale"; r: number; c: number; label: string; amount: number; loss: boolean };

function buildEvents(): AnimEvent[] {
  const out: AnimEvent[] = [];

  // PHASE 1 (0–3s): wave fill — cols left → right
  for (let c = 0; c < COLS; c++) {
    const at = lerp(200, 3000, c / COLS);
    for (let r = 0; r < ROWS; r++) {
      if (Math.random() < 0.62) {
        const isWin = Math.random() > 0.30;
        const mag = rand(0.3, isWin ? 0.95 : 0.85);
        out.push({ at: at + rand(0, 60), kind: "set", r, c, value: isWin ? mag : -mag });
      }
    }
  }

  // PHASE 2 (3–6s): row sweeps top-to-bottom
  for (let r = 0; r < ROWS; r++) {
    out.push({ at: 3200 + r * 320, kind: "row-sweep", r });
    for (let i = 0; i < 7; i++) {
      out.push({
        at: 3200 + r * 320 + rand(0, 320),
        kind: "pulse",
        r,
        c: irand(COLS),
      });
    }
  }

  // PHASE 3 (6–9s): col sweeps + dense pulses
  for (let i = 0; i < 9; i++) {
    const c = 6 + i * 9 + irand(6);
    if (c >= COLS) continue;
    out.push({ at: 6000 + i * 320, kind: "col-sweep", c });
  }
  for (let i = 0; i < 80; i++) {
    out.push({
      at: lerp(6000, 9000, Math.random()),
      kind: "pulse",
      r: irand(ROWS),
      c: irand(COLS),
    });
  }

  // PHASE 4 (9–13.5s): whale callouts — 2 wins + 1 big loss
  out.push({ at: 9300,  kind: "whale", r: 4, c: 76, label: WHALE_NAMES[0]!, amount:  48200, loss: false });
  out.push({ at: 11000, kind: "whale", r: 6, c: 60, label: WHALE_NAMES[3]!, amount: -28400, loss: true });
  out.push({ at: 12700, kind: "whale", r: 1, c: 48, label: WHALE_NAMES[2]!, amount:  31700, loss: false });
  for (let i = 0; i < 60; i++) {
    out.push({
      at: lerp(9000, 13500, Math.random()),
      kind: "pulse",
      r: irand(ROWS),
      c: irand(COLS),
    });
  }

  // PHASE 5 (13.5–18s): cooldown — soft pulses + flickers
  for (let i = 0; i < 24; i++) {
    out.push({
      at: lerp(13500, 17500, Math.random()),
      kind: "pulse",
      soft: true,
      r: irand(ROWS),
      c: irand(COLS),
    });
  }
  for (let i = 0; i < 18; i++) {
    out.push({
      at: lerp(13500, 17500, Math.random()),
      kind: "flicker",
      r: irand(ROWS),
      c: irand(COLS),
    });
  }

  out.sort((a, b) => a.at - b.at);
  return out;
}

export function HeroVisual() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cellsRef = useRef<Array<{ el: HTMLDivElement | null; value: number }>>(
    Array.from({ length: ROWS * COLS }, () => ({ el: null, value: 0 })),
  );
  const labelsRef = useRef<Array<HTMLDivElement | null>>(
    Array.from({ length: ROWS }, () => null),
  );
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const screenFlashRef = useRef<HTMLDivElement | null>(null);
  const statPnlRef = useRef<HTMLDivElement | null>(null);
  const statWrRef = useRef<HTMLDivElement | null>(null);
  const statWhalesRef = useRef<HTMLDivElement | null>(null);

  // Tape generated client-only to dodge SSR/CSR hydration mismatch.
  const [tapeHtml, setTapeHtml] = useState("");

  useEffect(() => {
    // ── Tape build (always — independent of motion preference) ──────
    const items: string[] = [];
    for (let i = 0; i < 26; i++) {
      const w = WHALE_NAMES[irand(WHALE_NAMES.length)]!;
      const isWin = Math.random() > 0.32;
      const amt = Math.floor(rand(180, 48000));
      const cat = CATS[irand(CATS.length)]!;
      items.push(
        `<span class="hv-ev"><span class="hv-who">${w}</span><span class="hv-amt ${
          isWin ? "hv-win" : "hv-loss"
        }">${isWin ? "+" : "−"}$${amt.toLocaleString()}</span><span class="hv-cat">${cat}</span></span>`,
      );
    }
    setTapeHtml(items.join("") + items.join(""));

    // Note: previously bailed on `prefers-reduced-motion` to a static
    // grid. Removed because (a) the animation IS the marketing demo —
    // a frozen heatmap defeats the hero — and (b) iOS in battery-saver
    // / Telegram in-app browser silently flips this flag on for many
    // users, which made the hero look broken on phone. If
    // accessibility requires a fallback later, prefer toning down the
    // most violent effects (screenFlash, sweep beams, scanline)
    // instead of bailing entirely.

    // ── Engine ──────────────────────────────────────────────────────
    const events = buildEvents();
    let lastEventIdx = 0;
    let lastT = 0;
    let activeCallouts: Array<{ el: HTMLDivElement; removeAt: number }> = [];
    let lastPnl = 0;
    let lastPnlText = "";
    let lastWrText = "";
    let lastWhalesText = "";
    const t0 = performance.now();
    let raf = 0;
    let visible = true;

    // Pause the engine when the hero is scrolled out of view. requestAnimationFrame
    // already pauses on hidden tabs; this handles same-tab scroll-past which is
    // the common case (user reads landing → scrolls to FAQ → still burning CPU
    // otherwise). Threshold 0 fires the moment any pixel re-enters / exits.
    const io =
      typeof IntersectionObserver !== "undefined" && rootRef.current
        ? new IntersectionObserver(
            (entries) => {
              for (const e of entries) visible = e.isIntersecting;
            },
            { threshold: 0 },
          )
        : null;
    if (io && rootRef.current) io.observe(rootRef.current);

    const setCell = (idx: number, v: number): void => {
      const c = cellsRef.current[idx];
      if (!c || !c.el) return;
      c.value = clamp(v, -1, 1);
      c.el.style.background = pnlBg(c.value);
    };

    const flashBright = (idx: number, ms = 320, isLoss = false): void => {
      const c = cellsRef.current[idx];
      if (!c || !c.el) return;
      const cls = isLoss ? "hv-flash-loss" : "hv-flash-bright";
      c.el.classList.add(cls);
      const el = c.el;
      setTimeout(() => el.classList.remove(cls), ms);
    };

    const pulseCell = (idx: number, soft = false): void => {
      const c = cellsRef.current[idx];
      if (!c) return;
      let v = c.value;
      if (Math.abs(v) < 0.05) {
        const isWin = Math.random() > 0.30;
        v = (isWin ? 1 : -1) * rand(0.45, soft ? 0.7 : 1);
      } else {
        const sign = v >= 0 ? 1 : -1;
        v = sign * Math.min(1, Math.abs(v) + rand(0.18, soft ? 0.28 : 0.5));
      }
      setCell(idx, v);
      flashBright(idx, soft ? 220 : 360, v < 0);
    };

    const flickerCell = (idx: number): void => {
      const c = cellsRef.current[idx];
      if (!c || !c.el) return;
      c.el.classList.add("hv-flicker");
      const el = c.el;
      setTimeout(() => el.classList.remove("hv-flicker"), 1700);
    };

    const spawnRowBeam = (r: number): void => {
      if (!gridWrapRef.current) return;
      const beam = document.createElement("div");
      beam.className = "hv-beam hv-beam-row";
      beam.style.top = `calc(${r} * (100% / ${ROWS}))`;
      beam.style.left = "-2%";
      gridWrapRef.current.appendChild(beam);
      requestAnimationFrame(() => {
        beam.style.transition = "left 1100ms cubic-bezier(.3,.0,.7,1)";
        beam.style.left = "102%";
      });
      setTimeout(() => beam.remove(), 1300);
    };
    const spawnColBeam = (c: number): void => {
      if (!gridWrapRef.current) return;
      const beam = document.createElement("div");
      beam.className = "hv-beam hv-beam-col";
      beam.style.left = `calc(${c} * (100% / ${COLS}))`;
      beam.style.top = "-4%";
      gridWrapRef.current.appendChild(beam);
      requestAnimationFrame(() => {
        beam.style.transition = "top 750ms cubic-bezier(.3,.0,.7,1)";
        beam.style.top = "104%";
      });
      setTimeout(() => beam.remove(), 900);
    };

    const rowSweep = (r: number): void => {
      spawnRowBeam(r);
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        setTimeout(() => {
          const cell = cellsRef.current[idx];
          if (!cell || !cell.el) return;
          cell.el.classList.add("hv-row-sweep");
          const el = cell.el;
          setTimeout(() => el.classList.remove("hv-row-sweep"), 280);
        }, c * 6);
      }
      const lbl = labelsRef.current[r];
      if (lbl) {
        lbl.classList.add("hv-hot");
        setTimeout(() => lbl.classList.remove("hv-hot"), 1200);
      }
    };

    const colSweep = (c: number): void => {
      spawnColBeam(c);
      for (let r = 0; r < ROWS; r++) {
        const idx = r * COLS + c;
        setTimeout(() => {
          const cell = cellsRef.current[idx];
          if (!cell || !cell.el) return;
          cell.el.classList.add("hv-col-sweep");
          if (Math.abs(cell.value) > 0.05) {
            const sign = cell.value >= 0 ? 1 : -1;
            setCell(idx, sign * Math.min(1, Math.abs(cell.value) + 0.22));
          }
          const el = cell.el;
          setTimeout(() => el.classList.remove("hv-col-sweep"), 320);
        }, r * 22);
      }
    };

    const ripple = (cr: number, cc: number, radius = 4): void => {
      for (let ring = 1; ring <= radius; ring++) {
        setTimeout(() => {
          for (let dr = -ring; dr <= ring; dr++) {
            for (let dc = -ring; dc <= ring; dc++) {
              if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
              const nr = cr + dr;
              const nc = cc + dc;
              if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
              const idx = nr * COLS + nc;
              const cell = cellsRef.current[idx];
              if (!cell || !cell.el) continue;
              cell.el.classList.add("hv-ripple");
              const el = cell.el;
              setTimeout(() => el.classList.remove("hv-ripple"), 320);
              if (Math.abs(cell.value) > 0.05 && Math.random() < 0.6) {
                const sign = cell.value >= 0 ? 1 : -1;
                setCell(idx, sign * Math.min(1, Math.abs(cell.value) + 0.15));
              }
            }
          }
        }, ring * 100);
      }
    };

    const screenFlash = (isLoss = false): void => {
      const sf = screenFlashRef.current;
      if (!sf) return;
      sf.classList.remove("hv-sf-show", "hv-sf-loss");
      void sf.offsetWidth;
      if (isLoss) sf.classList.add("hv-sf-loss");
      sf.classList.add("hv-sf-show");
    };

    const showCallout = (
      idx: number,
      mainText: string,
      subText: string,
      isLoss = false,
    ): void => {
      const cell = cellsRef.current[idx];
      if (!cell || !cell.el) return;
      const el = document.createElement("div");
      el.className = "hv-callout" + (isLoss ? " hv-loss" : "");
      el.innerHTML = `<div class="hv-clbl">${subText}</div><div class="hv-cval">${mainText}</div>`;
      cell.el.appendChild(el);
      requestAnimationFrame(() => el.classList.add("hv-show"));
      activeCallouts.push({ el, removeAt: performance.now() + 2000 });
    };

    const whaleEvent = (e: Extract<AnimEvent, { kind: "whale" }>): void => {
      const sign = e.loss ? -1 : 1;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = e.r + dr;
          const nc = e.c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const idx = nr * COLS + nc;
          setCell(idx, sign * (dr === 0 && dc === 0 ? 1 : 0.85));
          flashBright(idx, 520, e.loss);
        }
      }
      const subText = `${e.loss ? "Big loss" : "Big trade"} · ${e.label}`;
      const mainText = `${e.loss ? "−" : "+"}$${Math.abs(e.amount).toLocaleString()}`;
      showCallout(e.r * COLS + e.c, mainText, subText, e.loss);
      ripple(e.r, e.c, 4);
      screenFlash(e.loss);
    };

    const resetLoop = (): void => {
      cellsRef.current.forEach((cell, idx) => {
        if (!cell.el) return;
        cell.el.classList.remove(
          "hv-flash-bright", "hv-flash-loss", "hv-ripple",
          "hv-row-sweep", "hv-col-sweep", "hv-flicker",
        );
        setCell(idx, 0);
      });
      activeCallouts.forEach((c) => c.el.remove());
      activeCallouts = [];
      gridWrapRef.current?.querySelectorAll(".hv-beam").forEach((b) => b.remove());
      labelsRef.current.forEach((l) => l && l.classList.remove("hv-hot", "hv-cold"));
      lastEventIdx = 0;
    };

    const tick = (): void => {
      // Skip all work when the hero isn't on screen — saves CPU/battery
      // for users who scrolled past. RAF stays scheduled so we resume
      // smoothly when they scroll back up.
      if (!visible) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const now = performance.now();
      const t = (now - t0) % LOOP_MS;
      if (t < lastT) resetLoop();
      lastT = t;

      while (lastEventIdx < events.length && events[lastEventIdx]!.at <= t) {
        const e = events[lastEventIdx++]!;
        if (e.kind === "set") setCell(e.r * COLS + e.c, e.value);
        else if (e.kind === "pulse") pulseCell(e.r * COLS + e.c, e.soft);
        else if (e.kind === "flicker") flickerCell(e.r * COLS + e.c);
        else if (e.kind === "row-sweep") rowSweep(e.r);
        else if (e.kind === "col-sweep") colSweep(e.c);
        else if (e.kind === "whale") whaleEvent(e);
      }

      activeCallouts = activeCallouts.filter((c) => {
        if (now > c.removeAt) {
          c.el.classList.remove("hv-show");
          setTimeout(() => c.el.remove(), 280);
          return false;
        }
        return true;
      });

      // counters — phase01 ramps up during wave fill then idles
      const phase01 = Math.min(1, t / 3000);
      let pnl = Math.floor(
        8200 + phase01 * 176200 + Math.sin(t / 380) * 90 + Math.sin(t / 1700) * 1800,
      );
      // Dip during the loss whale (around t=11s)
      if (t > 11000 && t < 13500) {
        pnl -= Math.floor(28400 * Math.min(1, (t - 11000) / 800));
      }
      const wr = Math.floor(54 + phase01 * 14 + Math.sin(t / 1100) * 1.5);
      const whales = Math.floor(12 + phase01 * 36 + Math.sin(t / 2400) * 3);

      // Only touch the DOM when the visible text actually changes. The
      // raw pnl drifts every frame from the sin terms but the rounded,
      // formatted string is stable for ~10-20 frames at a time, so this
      // skips ~85% of the textContent writes.
      if (statPnlRef.current) {
        const pnlRounded = Math.round(pnl / 50) * 50;
        const pnlText = (pnlRounded >= 0 ? "+$" : "−$") + Math.abs(pnlRounded).toLocaleString();
        if (pnlText !== lastPnlText) {
          if (Math.abs(pnl - lastPnl) > 200) {
            statPnlRef.current.classList.remove("hv-bump");
            void statPnlRef.current.offsetWidth;
            statPnlRef.current.classList.add("hv-bump");
          }
          lastPnl = pnl;
          statPnlRef.current.classList.toggle("hv-loss", pnl < 0);
          statPnlRef.current.classList.toggle("hv-win", pnl >= 0);
          statPnlRef.current.textContent = pnlText;
          lastPnlText = pnlText;
        }
      }
      if (statWrRef.current) {
        const wrText = wr + "%";
        if (wrText !== lastWrText) {
          statWrRef.current.textContent = wrText;
          lastWrText = wrText;
        }
      }
      if (statWhalesRef.current) {
        const whalesText = String(whales);
        if (whalesText !== lastWhalesText) {
          statWhalesRef.current.textContent = whalesText;
          lastWhalesText = whalesText;
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      style={{
        position: "relative",
        background: `radial-gradient(ellipse at top, #0d1219 0%, ${T.bg} 60%)`,
        color: T.text,
        fontSize: 12,
        letterSpacing: "0.02em",
        border: "1px solid rgba(48,54,61,0.7)",
        borderRadius: 14,
        padding: "16px 18px 14px",
        boxShadow:
          "0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(240,180,41,0.06), inset 0 1px 0 rgba(255,255,255,0.02)",
        overflow: "hidden",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gap: 12,
        aspectRatio: "1.18 / 1",
        minHeight: 420,
      }}
    >
      <header className="hv-header">
        <div className="hv-brand-block">
          <div style={{ display: "flex", gap: 4 }}>
            {[T.loss, "#f0b429", T.win].map((c) => (
              <span key={c} style={{ width: 7, height: 7, borderRadius: 7, background: c, opacity: 0.55 }} />
            ))}
          </div>
          <div
            style={{
              fontSize: 9,
              color: T.textDim,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              borderLeft: `1px solid ${T.line}`,
              paddingLeft: 11,
              lineHeight: 1.4,
            }}
          >
            pnl heatmap
            <br />
            who's actually winning
          </div>
        </div>

        <div className="hv-mode-block">
          <span className="hv-mode-chip">macro · 1d × 12w · 84</span>
          <span className="hv-live-pill">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: T.win,
                animation: "hvPulse 1.4s infinite",
                boxShadow: "0 0 8px rgba(63,185,80,0.7)",
              }}
            />
            live
          </span>
        </div>

        <div className="hv-stats">
          <Stat label="Net PnL 24h">
            <div ref={statPnlRef} className="hv-stat-val hv-win">$0</div>
          </Stat>
          <Stat label="Win rate">
            <div ref={statWrRef} className="hv-stat-val">0%</div>
          </Stat>
          <Stat label="Active">
            <div ref={statWhalesRef} className="hv-stat-val">0</div>
          </Stat>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "76px 1fr", gap: 10, overflow: "hidden", minHeight: 0 }}>
        <div style={{ display: "grid", gridAutoRows: "1fr", gap: 2, paddingTop: 22 }}>
          {CATS.map((c, r) => (
            <div
              key={c}
              ref={(el) => {
                labelsRef.current[r] = el;
              }}
              className="hv-cat-label"
              style={{
                display: "flex",
                alignItems: "center",
                fontSize: 9,
                color: T.textMid,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                fontWeight: 500,
                transition: "color 220ms, text-shadow 220ms",
              }}
            >
              {c}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateRows: "16px 1fr", overflow: "hidden", minHeight: 0 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${WEEK_TICKS}, 1fr)`,
              gap: 1,
              alignItems: "end",
            }}
          >
            {Array.from({ length: WEEK_TICKS }).map((_, i) => {
              const isNow = i === WEEK_TICKS - 1;
              return (
                <div
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: isNow ? "flex-end" : "center",
                    paddingRight: isNow ? 4 : 0,
                    paddingBottom: 3,
                    borderBottom: `1px solid ${isNow ? T.win : T.line}`,
                    height: "100%",
                  }}
                >
                  {isNow && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        color: T.win,
                        fontSize: 8,
                        letterSpacing: "0.2em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          background: T.win,
                          borderRadius: "50%",
                          boxShadow: "0 0 6px rgba(63,185,80,0.7)",
                          animation: "hvPulse 1.4s infinite",
                        }}
                      />
                      Now
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div ref={gridWrapRef} style={{ position: "relative", overflow: "hidden", minHeight: 0 }}>
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `calc(${TODAY_COL_START} / ${COLS} * 100%)`,
                width: `calc(${COLS - TODAY_COL_START} / ${COLS} * 100%)`,
                background: "linear-gradient(180deg, rgba(63,185,80,0.06), rgba(63,185,80,0.02))",
                pointerEvents: "none",
                borderLeft: "1px dashed rgba(63,185,80,0.20)",
              }}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                gridAutoRows: "1fr",
                gap: 1,
                height: "100%",
              }}
            >
              {Array.from({ length: ROWS * COLS }).map((_, idx) => (
                <div
                  // eslint-disable-next-line react/no-array-index-key
                  key={idx}
                  ref={(el) => {
                    const slot = cellsRef.current[idx];
                    if (slot) slot.el = el;
                  }}
                  className="hv-cell"
                  style={{
                    background: T.base,
                    borderRadius: 1,
                    position: "relative",
                    transition: "background 200ms ease, transform 100ms",
                  }}
                />
              ))}
            </div>
            <div ref={screenFlashRef} className="hv-screen-flash" />
          </div>
        </div>
      </div>

      <footer className="hv-footer">
        <span className="hv-footer-label">PnL Tape</span>
        <div
          className="hv-tape-mask"
          style={{
            overflow: "hidden",
            mask: "linear-gradient(90deg, transparent 0, #000 4%, #000 96%, transparent 100%)",
            WebkitMask: "linear-gradient(90deg, transparent 0, #000 4%, #000 96%, transparent 100%)",
          }}
        >
          {/* Tape content is internally generated, sandbox-safe (string literals only). */}
          <div className="hv-tape-row" dangerouslySetInnerHTML={{ __html: tapeHtml }} />
        </div>
        <span className="hv-footer-label hv-footer-label-right">
          <span style={{ color: T.win }}>▸</span>
          10,426 wallets
        </span>
      </footer>

      <div className="hv-scanline" />

      <style>{`
        @keyframes hvPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes hvFlicker {
          0%, 100% { filter: brightness(1); }
          18% { filter: brightness(1.8); }
          32% { filter: brightness(0.85); }
          52% { filter: brightness(1.6); }
          72% { filter: brightness(0.95); }
        }
        @keyframes hvScanline {
          0%, 100% { opacity: 0; }
          50% { opacity: 0.04; }
        }
        @keyframes hvBump {
          0% { transform: translateY(0) scale(1); }
          35% { transform: translateY(-3px) scale(1.04); }
          100% { transform: translateY(0) scale(1); }
        }
        @keyframes hvScreenFlash {
          0% { opacity: 0; }
          20% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes hvScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        /* ── Header layout ─────────────────────────────────────── */
        .hv-header {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 14px;
          min-width: 0;
        }
        .hv-brand-block {
          display: flex;
          align-items: center;
          gap: 11px;
          min-width: 0;
        }
        .hv-mode-block {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: center;
          min-width: 0;
        }
        .hv-mode-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 9px;
          background: rgba(63,185,80,0.07);
          border: 1px solid rgba(63,185,80,0.22);
          border-radius: 3px;
          color: ${T.win};
          font-size: 9.5px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 500;
          white-space: nowrap;
        }
        .hv-live-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: ${T.win};
          font-size: 9.5px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          font-weight: 500;
        }
        .hv-stats {
          display: flex;
          gap: 12px;
          min-width: 0;
        }

        /* ── Footer layout ─────────────────────────────────────── */
        .hv-footer {
          border-top: 1px solid ${T.line};
          padding-top: 8px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 14px;
          align-items: center;
        }
        .hv-footer-label {
          font-size: 8.5px;
          color: ${T.textDim};
          letter-spacing: 0.24em;
          text-transform: uppercase;
          font-weight: 500;
        }
        .hv-footer-label-right {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }

        /* ── Narrow container: collapse 3-col header → 2 rows, drop
              decorative brand+sub + mode chip, stretch stats across
              the full width with min-width:0 so labels can ellipsize.
              Triggers at <1100px because the awkward 2-col desktop
              zone (980-1280px viewport) gives HeroVisual <550px of
              width — same crampedness as mobile. ─────────────────── */
        @media (max-width: 1100px) {
          .hv-header {
            grid-template-columns: 1fr auto;
            grid-template-rows: auto auto;
            gap: 10px 8px;
          }
          .hv-brand-block { display: none; }
          .hv-mode-block {
            grid-column: 1 / 2;
            grid-row: 1;
            justify-content: flex-start;
          }
          .hv-mode-chip { display: none; }
          .hv-stats {
            grid-column: 1 / -1;
            grid-row: 2;
            justify-content: space-between;
            gap: 6px;
          }
          .hv-stat-val { font-size: 13px; }
          .hv-stat-block {
            padding-left: 7px;
            min-width: 0;
            flex: 1 1 0;
          }
          .hv-stat-block:first-child { padding-left: 0; border-left: 0; }
          .hv-stat-label { font-size: 7.5px; letter-spacing: 0.16em; }
          .hv-footer {
            grid-template-columns: auto 1fr;
            gap: 10px;
          }
          .hv-footer-label-right { display: none; }
        }

        .hv-cat-label.hv-hot { color: ${T.win}; text-shadow: 0 0 12px rgba(63,185,80,0.6); }
        .hv-cat-label.hv-cold { color: ${T.loss}; text-shadow: 0 0 12px rgba(248,81,73,0.6); }

        .hv-cell.hv-flash-bright {
          filter: brightness(2.1) saturate(1.3);
          transform: scaleY(1.3) scaleX(1.05);
          z-index: 4;
          box-shadow: 0 0 14px rgba(255,255,255,0.45);
        }
        .hv-cell.hv-flash-loss {
          filter: brightness(2) saturate(1.3);
          transform: scaleY(1.3) scaleX(1.05);
          z-index: 4;
          box-shadow: 0 0 14px rgba(248,81,73,0.55);
        }
        .hv-cell.hv-ripple {
          filter: brightness(1.55) saturate(1.15);
          z-index: 2;
          box-shadow: 0 0 8px rgba(255,255,255,0.2);
        }
        .hv-cell.hv-row-sweep {
          filter: brightness(1.85) saturate(1.2);
          transform: scaleY(1.18);
          z-index: 3;
        }
        .hv-cell.hv-col-sweep {
          filter: brightness(1.7) saturate(1.15);
          transform: scaleY(1.12);
          z-index: 3;
        }
        .hv-cell.hv-flicker { animation: hvFlicker 1.6s ease-in-out; }

        .hv-beam {
          position: absolute;
          pointer-events: none;
          z-index: 5;
        }
        .hv-beam-row {
          height: calc(100% / ${ROWS});
          width: 12px;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%);
          filter: blur(2px);
          mix-blend-mode: screen;
        }
        .hv-beam-col {
          width: calc(100% / ${COLS});
          height: 100%;
          background: linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%);
          filter: blur(2px);
          mix-blend-mode: screen;
        }

        .hv-callout {
          position: absolute;
          background: rgba(8,11,16,0.96);
          border: 1px solid ${T.win};
          padding: 7px 10px;
          font-size: 10px;
          color: ${T.text};
          box-shadow: 0 8px 30px rgba(0,0,0,0.7), 0 0 24px rgba(63,185,80,0.4);
          pointer-events: none;
          transform: translate(-50%, -130%) scale(0.92);
          border-radius: 3px;
          white-space: nowrap;
          z-index: 10;
          opacity: 0;
          transition: opacity 220ms, transform 260ms cubic-bezier(.2,1.4,.4,1);
        }
        .hv-callout.hv-loss {
          border-color: ${T.loss};
          box-shadow: 0 8px 30px rgba(0,0,0,0.7), 0 0 24px rgba(248,81,73,0.4);
        }
        .hv-callout.hv-show { opacity: 1; transform: translate(-50%, -150%) scale(1); }
        .hv-callout .hv-clbl {
          font-size: 8px;
          color: ${T.textDim};
          letter-spacing: 0.22em;
          text-transform: uppercase;
          font-weight: 500;
        }
        .hv-callout .hv-cval {
          font-weight: 700;
          color: ${T.winText};
          font-size: 13px;
          margin-top: 3px;
          font-variant-numeric: tabular-nums;
        }
        .hv-callout.hv-loss .hv-cval { color: ${T.lossText}; }
        .hv-callout::after {
          content: '';
          position: absolute;
          left: 50%;
          bottom: -6px;
          transform: translateX(-50%);
          border: 6px solid transparent;
          border-top-color: ${T.win};
        }
        .hv-callout.hv-loss::after { border-top-color: ${T.loss}; }

        .hv-screen-flash {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 50;
          background: radial-gradient(ellipse at center, rgba(63,185,80,0.18) 0%, transparent 60%);
          opacity: 0;
        }
        .hv-screen-flash.hv-sf-show { animation: hvScreenFlash 700ms ease-out; }
        .hv-screen-flash.hv-sf-loss {
          background: radial-gradient(ellipse at center, rgba(248,81,73,0.22) 0%, transparent 60%);
        }

        .hv-scanline {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 3px);
          pointer-events: none;
          animation: hvScanline 4s ease-in-out infinite;
          z-index: 100;
          border-radius: inherit;
        }

        .hv-stat-val {
          font-size: 16px;
          font-weight: 600;
          color: ${T.text};
          font-variant-numeric: tabular-nums;
          transition: color 200ms;
        }
        .hv-stat-val.hv-win { color: ${T.winText}; }
        .hv-stat-val.hv-loss { color: ${T.lossText}; }
        .hv-stat-val.hv-bump { animation: hvBump 320ms ease-out; }

        .hv-tape-row {
          display: flex;
          gap: 22px;
          white-space: nowrap;
          animation: hvScroll 28s linear infinite;
          font-size: 10.5px;
          font-variant-numeric: tabular-nums;
          width: max-content;
        }
        .hv-ev { display: inline-flex; gap: 7px; align-items: baseline; }
        .hv-who { color: ${T.textDim}; font-size: 9.5px; }
        .hv-amt { font-weight: 600; }
        .hv-amt.hv-win { color: ${T.winText}; }
        .hv-amt.hv-loss { color: ${T.lossText}; }
        .hv-cat { color: ${T.textMid}; font-size: 8.5px; letter-spacing: 0.16em; text-transform: uppercase; }
      `}</style>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="hv-stat-block"
      style={{
        display: "flex",
        flexDirection: "column",
        borderLeft: `1px solid ${T.line}`,
        paddingLeft: 9,
        minWidth: 60,
      }}
    >
      <div
        className="hv-stat-label"
        style={{
          fontSize: 8,
          color: T.textDim,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: 3,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
