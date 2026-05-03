import { categoryMeta } from "@/lib/categories";
import { fmtMoney, fmtMoneyShort } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import type { Category, HeatmapCell, HeatmapRange } from "@/lib/types";

export type TooltipAnchor = {
  x: number;
  y: number;
  w: number;
  h: number;
  parentW: number;
  parentH: number;
};

function rangeUnit(r: HeatmapRange): string {
  return r === "1h" ? "5m" : r === "24h" ? "1h" : "1d";
}

function Stat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          color: TOKENS.textMuted,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          color: color ?? TOKENS.text,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function Tooltip({
  cell,
  anchor,
  category,
  slotLabel,
  range,
}: {
  cell: HeatmapCell;
  anchor: TooltipAnchor;
  category: Category;
  slotLabel: string;
  range: HeatmapRange;
}) {
  const meta = categoryMeta(category);

  const tipW = 280;
  const tipH = 180;
  const margin = 10;
  let left = anchor.x + anchor.w / 2 - tipW / 2;
  let top = anchor.y - tipH - margin;
  if (top < 8) top = anchor.y + anchor.h + margin;
  left = Math.max(8, Math.min(left, (anchor.parentW || 1200) - tipW - 8));

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: tipW,
        background: TOKENS.panel,
        border: `1px solid ${TOKENS.borderHi}`,
        borderRadius: 8,
        padding: "12px 14px",
        fontFamily: TOKENS.font,
        color: TOKENS.text,
        boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.4)",
        pointerEvents: "none",
        zIndex: 30,
        animation: "tipIn .12s ease-out",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          style={{
            background: meta.color,
            color: "#fff",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.4,
            padding: "3px 6px",
            borderRadius: 3,
            textTransform: "uppercase",
          }}
        >
          {meta.label}
        </span>
        <span style={{ color: TOKENS.textSec, fontSize: 11, fontFamily: TOKENS.mono }}>
          {slotLabel === "NOW" || slotLabel === "TODAY"
            ? `last ${rangeUnit(range)}`
            : slotLabel}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        <Stat label="SIGNALS" value={cell.count} />
        <Stat
          label="PNL"
          value={fmtMoney(cell.pnl)}
          color={cell.pnl > 0 ? TOKENS.pos : cell.pnl < 0 ? TOKENS.neg : TOKENS.textSec}
        />
        <Stat label="VOLUME" value={cell.volume ? fmtMoneyShort(cell.volume) : "—"} />
        <Stat
          label="WIN"
          value={cell.winRate === null ? "—" : Math.round(cell.winRate * 100) + "%"}
          color={cell.winRate === null ? TOKENS.textSec : cell.winRate >= 0.5 ? TOKENS.pos : TOKENS.neg}
        />
      </div>

      {cell.trades.length > 0 && (
        <div style={{ borderTop: `1px solid ${TOKENS.border}`, paddingTop: 8 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: 0.5,
              color: TOKENS.textMuted,
              textTransform: "uppercase",
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            Top signals
          </div>
          {cell.trades.slice(0, 3).map((t, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "8px 1fr auto auto",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                marginBottom: 3,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 8, background: t.whaleColor }} />
              <span
                style={{
                  color: TOKENS.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {t.whaleAlias}
              </span>
              <span
                style={{
                  color: t.side === "BUY" ? TOKENS.pos : t.side === "SELL" ? TOKENS.neg : TOKENS.textSec,
                  fontWeight: 700,
                  fontSize: 10,
                }}
              >
                {t.side}
              </span>
              <span style={{ color: TOKENS.textSec, fontFamily: TOKENS.mono, fontSize: 10 }}>
                {fmtMoneyShort(t.sizeUsd)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
