"use client";

import { useState } from "react";
import { TOKENS } from "@/lib/tokens";

/** Polymarket market thumbnail — small rounded square. Falls back to a
 *  neutral placeholder when the URL is null or fails to load. */
export function MarketIcon({ url, size = 22 }: { url: string | null; size?: number }) {
  const [errored, setErrored] = useState(false);
  if (!url || errored) {
    return (
      <span
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: 4,
          background: TOKENS.panel2,
          border: `1px solid ${TOKENS.border}`,
          flexShrink: 0,
          display: "inline-block",
        }}
      />
    );
  }
  return (
    <img
      src={url}
      width={size}
      height={size}
      alt=""
      onError={() => setErrored(true)}
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        objectFit: "cover",
        background: TOKENS.panel2,
        border: `1px solid ${TOKENS.border}`,
        flexShrink: 0,
        display: "inline-block",
      }}
    />
  );
}
