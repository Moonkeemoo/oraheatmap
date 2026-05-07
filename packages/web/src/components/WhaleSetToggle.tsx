/**
 * WhaleSetToggle — single-select strip switching the WHALES subject's
 * row source between ONLINE and WATCHLIST.
 *
 *   ONLINE     · top whales currently active in the mode's window
 *                 (LIVE → range, MACRO/PATTERN → mode lookback)
 *   WATCHLIST  · the user's pinned set. Locked for anonymous users
 *                 (clicking opens the login modal); empty for authed
 *                 users with nothing pinned (badge reads 0).
 *
 * Sits above the heatmap, only when subject="whales". Rendered via the
 * Lists L3 chrome — bare-pill chips with subtle hairline borders, white
 * text, accent fill on the active option. Counts are passed in by the
 * caller because they live on different sources (heatmap response for
 * ONLINE, useWatchlist hook for WATCHLIST).
 */

import { TOKENS } from "@/lib/tokens";
import type { WhaleSet } from "@/lib/types";

export function WhaleSetToggle({
  whaleSet,
  setWhaleSet,
  isAuthed,
  onRequestLogin,
  onlineCount,
  watchlistCount,
}: {
  whaleSet: WhaleSet;
  setWhaleSet: (s: WhaleSet) => void;
  isAuthed: boolean;
  onRequestLogin: () => void;
  /** Number of rows shown on the ONLINE tab when it's active. `null`
   *  on the WATCHLIST tab — we don't fetch the online count
   *  independently, so the inactive ONLINE badge stays empty rather
   *  than displaying a misleading "12" (the watchlist size). */
  onlineCount: number | null;
  /** Number of pinned whales for the authed user. Always available
   *  client-side via useWatchlist, so the WATCHLIST badge can render
   *  on either tab. */
  watchlistCount: number;
}) {
  // Tiny pills with icon + count, no word labels — both pills need to
  // fit on a single line inside the ~150px label-column. Earlier
  // "ONLINE / WATCHLIST" labels wrapped to two rows on every viewport.
  // Tooltip carries the long-form description so the meaning isn't
  // lost: hover/long-press surfaces "Whales active in the current
  // window" / "Your pinned whales".
  const renderTab = (
    s: WhaleSet,
    icon: string,
    iconActive: string,
    count: number | null,
    locked: boolean,
  ): React.ReactNode => {
    const active = whaleSet === s;
    return (
      <button
        key={s}
        type="button"
        onClick={() => {
          if (locked) {
            onRequestLogin();
            return;
          }
          setWhaleSet(s);
        }}
        title={
          locked
            ? "Sign in to pin whales to your watchlist"
            : s === "online"
              ? "Whales active in the current window"
              : "Your pinned whales"
        }
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          background: active ? TOKENS.accent : "transparent",
          border: `1px solid ${active ? TOKENS.accent : "rgba(255,255,255,0.10)"}`,
          color: active ? "#1a1410" : TOKENS.textSec,
          fontFamily: TOKENS.font,
          fontSize: 9,
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: 999,
          cursor: locked ? "help" : "pointer",
          transition: "background-color .12s, border-color .12s, color .12s",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 10, lineHeight: 1 }}>
          {active ? iconActive : icon}
        </span>
        {count !== null && (
          <span
            style={{
              fontFamily: TOKENS.mono,
              fontSize: 9,
              fontWeight: 600,
              opacity: active ? 0.85 : 0.7,
            }}
          >
            {count}
          </span>
        )}
        {locked && (
          <span style={{ fontSize: 8, opacity: 0.7, marginLeft: 1 }}>🔒</span>
        )}
      </button>
    );
  };
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        flexWrap: "nowrap",
      }}
    >
      {/* Online — green pulsing dot icon. Filled when active so the
          whole pill carries that "live signal" feel. */}
      {renderTab("online", "●", "●", onlineCount, false)}
      {/* Watchlist — star icon, filled when pinned-set is active. */}
      {renderTab("watchlist", "☆", "★", watchlistCount, !isAuthed)}
    </div>
  );
}
