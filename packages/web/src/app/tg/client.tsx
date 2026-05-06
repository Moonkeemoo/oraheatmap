"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Heatmap } from "@/components/Heatmap";
import { TOKENS } from "@/lib/tokens";

// Minimal type for the bits of WebApp we touch. The full SDK surface is
// large; only model what we use so a future minor version drift in
// telegram-web-app.js doesn't tank the typecheck.
type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { id?: number; username?: string } };
  ready: () => void;
  expand: () => void;
  /** TG-reported visible height inside the WebView. Different from
   *  100dvh: TG accounts for its own bottom panel, the keyboard, and
   *  fullscreen-mode safe areas. When this value changes (keyboard
   *  open, swipe-collapse, fullscreen toggle) `viewportChanged` fires
   *  and we resize the app shell so StatsBar stays on-screen. */
  viewportHeight: number;
  viewportStableHeight: number;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
  /** Background colour shown behind the WebView while it loads. */
  setBackgroundColor?: (color: string) => void;
  setHeaderColor?: (color: string) => void;
  /** Detected app theme — "dark" or "light". We're a dark app, so we
   *  ignore this for now; v1.x can adapt if there's demand. */
  colorScheme?: "light" | "dark";
  /** Bot API 8.0+ — request the "no TG chrome" fullscreen mode. The
   *  BotFather Launch Mode = Fullscreen sets this as the default
   *  behaviour, but the API call is the explicit/programmatic path
   *  and is safe to call even when the launch mode handles it
   *  automatically (no-ops on platforms that don't support it). */
  requestFullscreen?: () => void;
  isFullscreen?: boolean;
  /** Bot API 7.7+ — silence the "swipe-down to close" gesture so a
   *  user dragging across our scrollable middle pane doesn't close
   *  the Mini App by accident. */
  disableVerticalSwipes?: () => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const SDK_URL = "https://telegram.org/js/telegram-web-app.js";

type AuthState = "loading" | "outside-tg" | "ready" | "error";

export function TgMiniApp() {
  const { status: sessionStatus } = useSession();
  const [state, setState] = useState<AuthState>("loading");
  const [error, setError] = useState<string | null>(null);
  // Strict-mode dev double-fires effects; guard the auth call so we
  // don't POST initData twice (server validates it the first time
  // either way, but cleaner not to flap).
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    // Inject the Telegram WebApp SDK. Idempotent — if the script tag
    // already exists (rare; only happens when re-mounting), reuse it.
    const ensureSdk = (): Promise<void> =>
      new Promise((resolve, reject) => {
        if (window.Telegram?.WebApp) return resolve();
        const existing = document.getElementById("tg-webapp-sdk");
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("SDK load failed")), { once: true });
          return;
        }
        const s = document.createElement("script");
        s.id = "tg-webapp-sdk";
        s.src = SDK_URL;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("SDK load failed"));
        document.head.appendChild(s);
      });

    (async () => {
      try {
        await ensureSdk();
        const wa = window.Telegram?.WebApp;
        if (!wa) {
          setState("error");
          setError("Telegram SDK not available.");
          return;
        }
        // Tell Telegram we're rendered (hides the loading spinner)
        // and request full viewport — the heatmap needs every px.
        wa.ready();
        wa.expand();
        // Bot API 8.0+ Launch Mode = Fullscreen handshake. Both
        // calls no-op on older clients / desktop, safe to call.
        wa.requestFullscreen?.();
        wa.disableVerticalSwipes?.();
        // Match our app shell colours so the seam between native
        // chrome and our content is invisible.
        wa.setBackgroundColor?.(TOKENS.bg);
        wa.setHeaderColor?.(TOKENS.bg);

        // Mark the body so the .app-shell CSS can switch from 100dvh
        // (works for plain mobile Safari) to the TG-reported viewport
        // height (which actually accounts for fullscreen safe areas
        // and the bottom panel). Without this swap the StatsBar gets
        // pushed below the fold in TG fullscreen mode.
        document.body.classList.add("tg-mini-app");
        const syncViewport = (): void => {
          document.documentElement.style.setProperty(
            "--tg-viewport-height",
            `${wa.viewportStableHeight || wa.viewportHeight}px`,
          );
        };
        syncViewport();
        wa.onEvent?.("viewportChanged", syncViewport);

        // No initData ⇒ page opened outside Telegram (someone shared
        // the URL to a regular browser). Show a hint, don't try to
        // sign in — the auth would fail with "missing initData".
        if (!wa.initData) {
          setState("outside-tg");
          return;
        }

        // Already signed in via a previous session? Skip the second
        // signIn — Telegram WebView reuses our cookie store across
        // re-opens within the same TG session.
        if (sessionStatus === "authenticated") {
          setState("ready");
          return;
        }

        const result = await signIn("telegram-webapp", {
          initData: wa.initData,
          redirect: false,
        });
        if (result?.error) {
          setState("error");
          setError(result.error);
          return;
        }
        setState("ready");
      } catch (err) {
        setState("error");
        setError((err as Error).message);
      }
    })();
  }, [sessionStatus]);

  // Sign-in completed (auth status flips authenticated) — surface ready.
  // Covers the case where signIn() resolved before useSession picked up
  // the new cookie.
  useEffect(() => {
    if (sessionStatus === "authenticated" && state === "loading") {
      setState("ready");
    }
  }, [sessionStatus, state]);

  if (state === "ready") return <Heatmap />;
  return <Splash state={state} error={error} />;
}

function Splash({ state, error }: { state: AuthState; error: string | null }) {
  const message =
    state === "loading"
      ? "Connecting your Telegram account…"
      : state === "outside-tg"
        ? "Open this app in Telegram via @Oralab_bot to use the Mini App. The full web version is available at oralab.xyz/app."
        : error ?? "Sign-in failed.";

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
      <div style={{ maxWidth: 360 }}>
        <div
          aria-hidden
          style={{
            width: 12,
            height: 12,
            borderRadius: 12,
            background:
              state === "error" ? TOKENS.neg : state === "outside-tg" ? TOKENS.textMuted : TOKENS.accent,
            margin: "0 auto 16px",
            boxShadow: `0 0 14px ${state === "error" ? TOKENS.neg : TOKENS.accent}`,
            animation: state === "loading" ? "heroPulse 1.4s ease-in-out infinite" : undefined,
          }}
        />
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
          {state === "error" ? "Sign-in failed" : state === "outside-tg" ? "Telegram only" : "oralab"}
        </div>
        <div style={{ fontSize: 12, color: TOKENS.textSec, lineHeight: 1.5 }}>{message}</div>
      </div>
    </main>
  );
}
