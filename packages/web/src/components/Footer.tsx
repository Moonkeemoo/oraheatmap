"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";
import { TOKENS } from "@/lib/tokens";
import { TelegramIcon, XIcon } from "./ProviderIcons";

const X_URL = "https://x.com/oralabxyz";
// Telegram bot launches our Mini App via the BotFather-registered short
// name (oralabapp). Sharing the bot link directly is friendlier than
// the t.me/Oralab_bot/oralabapp deep-link — TG resolves it the same way
// and the user sees the bot profile first.
const TG_URL = "https://t.me/Oralab_bot";

/**
 * Footer for landing, legal pages, and the app shell. Two visual modes:
 *
 *  - default: two-row, padded, used on landing + /privacy + /terms.
 *  - compact: single thin strip — used on /app where every pixel of grid
 *    real estate matters but legal links still need to be reachable from
 *    a bookmarked /app entry point.
 */
export function Footer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <footer
        style={{
          width: "100%",
          padding: "6px 16px",
          borderTop: `1px solid ${TOKENS.border}`,
          background: TOKENS.bg,
          color: TOKENS.textMuted,
          fontFamily: TOKENS.font,
          fontSize: 10,
          textAlign: "center",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        © {new Date().getFullYear()} oralab ·{" "}
        <Link href="/privacy" style={compactLink}>Privacy</Link> ·{" "}
        <Link href="/terms" style={compactLink}>Terms</Link> ·{" "}
        <a
          href={X_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="oralab on X"
          onClick={() => track.externalClick("twitter")}
          style={{ ...compactLink, display: "inline-flex", verticalAlign: "middle" }}
        >
          <XIcon size={11} />
        </a>{" "}
        ·{" "}
        <a
          href={TG_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="oralab Telegram bot"
          onClick={() => track.externalClick("telegram")}
          style={{ ...compactLink, display: "inline-flex", verticalAlign: "middle" }}
        >
          <TelegramIcon size={11} />
        </a>{" "}
        · Not affiliated with Polymarket
      </footer>
    );
  }
  return (
    <footer
      style={{
        width: "100%",
        padding: "20px 24px 24px",
        borderTop: `1px solid ${TOKENS.border}`,
        color: TOKENS.textMuted,
        fontFamily: TOKENS.font,
        fontSize: 12,
        boxSizing: "border-box",
        marginTop: "auto",
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span style={{ color: TOKENS.textMuted }}>
          © {new Date().getFullYear()} oralab · Not affiliated with Polymarket.
        </span>
        <nav style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/" style={fullLink}>Home</Link>
          <Link href="/app" style={fullLink}>App</Link>
          <Link href="/privacy" style={fullLink}>Privacy</Link>
          <Link href="/terms" style={fullLink}>Terms</Link>
          <a
            href={X_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="oralab on X"
            onClick={() => track.externalClick("twitter")}
            style={{
              ...fullLink,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <XIcon size={14} />
            <span>@oralabxyz</span>
          </a>
          <a
            href={TG_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="oralab Telegram bot"
            onClick={() => track.externalClick("telegram")}
            style={{
              ...fullLink,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <TelegramIcon size={14} />
            <span>@Oralab_bot</span>
          </a>
        </nav>
      </div>
    </footer>
  );
}

const fullLink: React.CSSProperties = {
  color: TOKENS.textSec,
  textDecoration: "none",
  fontSize: 12,
  transition: "color .12s",
};

const compactLink: React.CSSProperties = {
  color: TOKENS.textSec,
  textDecoration: "none",
};
