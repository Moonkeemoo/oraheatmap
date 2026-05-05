import type { ReactNode } from "react";
import { TOKENS } from "@/lib/tokens";

/** Single labelled stat block used inside the tooltip header. Tiny — kept
 *  separate so Tooltip.tsx isn't peppered with low-level layout. */
export function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: ReactNode;
  color?: string;
}) {
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
