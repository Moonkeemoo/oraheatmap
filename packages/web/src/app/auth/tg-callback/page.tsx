/**
 * Telegram OAuth redirect-callback handler.
 *
 * The mobile-friendly Telegram login flow uses a full-page redirect to
 * https://oauth.telegram.org/auth instead of the popup-based widget
 * (which iOS Safari blocks). After auth, Telegram redirects back here
 * with the verified payload as URL query params:
 *   ?id=...&first_name=...&username=...&photo_url=...&auth_date=...&hash=...
 *
 * The inner client component packs those into the same JSON shape the
 * existing Telegram Credentials provider expects, calls signIn(), then
 * navigates back to /app on success. Same callback handles BOTH first-
 * time sign-in and the link flow when ?mode=link is present.
 *
 * Wrapped in Suspense because useSearchParams() requires it under
 * Next.js 15 App Router.
 */

import { Suspense } from "react";
import { TgCallback } from "./client";
import { TOKENS } from "@/lib/tokens";

// Client-side only — the page reads the URL hash that only the browser
// sees. Force-dynamic so it isn't statically prerendered.
export const dynamic = "force-dynamic";

export default function TelegramCallbackPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <TgCallback />
    </Suspense>
  );
}

function Fallback() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: TOKENS.bg,
        color: TOKENS.text,
        fontFamily: TOKENS.font,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 12, color: TOKENS.textSec }}>Loading…</div>
    </main>
  );
}
