/**
 * Telegram Mini App entrypoint.
 *
 * Telegram launches us at https://oralab.xyz/tg via the BotFather-
 * registered Web App URL (t.me/Oralab_bot/oralabapp). The page boots the
 * Telegram WebApp SDK, signs the user in by handing the verified
 * `initData` to our `telegram-webapp` Credentials provider, then drops
 * straight into the Heatmap UI — no LoginModal, no provider picker.
 *
 * If the page is opened OUTSIDE Telegram (e.g. someone shares the URL
 * to a regular browser), `Telegram.WebApp.initData` is empty and we
 * just show a "open in Telegram" hint instead of crashing.
 */

import type { Metadata } from "next";
import { TgMiniApp } from "./client";

export const metadata: Metadata = {
  title: "oralab Mini App",
  description: "Polymarket whale heatmap inside Telegram.",
  // Mini App page is gated behind the TG WebView handshake — nothing
  // useful for crawlers to index. Keep them on the marketing page.
  robots: { index: false, follow: true },
};

// initData arrives at runtime via the WebApp SDK only — no SSR value
// to compute, so prerender is fine. Mark dynamic anyway so the auth
// signIn call inside the client doesn't get statically bisected.
export const dynamic = "force-dynamic";

export default function TgMiniAppPage() {
  return <TgMiniApp />;
}
