"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { TOKENS } from "@/lib/tokens";

const KNOWN_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "username",
  "photo_url",
  "auth_date",
  "hash",
] as const;

export function TgCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState<string>("Completing Telegram sign-in…");
  // useEffect runs twice in Strict Mode dev — guard with a ref so we
  // don't double-fire signIn / link POST.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    // Build the payload. Telegram passes EXACTLY the fields it signed —
    // missing ones (e.g. no username) just don't appear in the URL.
    // verifyTelegram on the backend tolerates absent optional fields.
    const payload: Record<string, string> = {};
    for (const k of KNOWN_FIELDS) {
      const v = params.get(k);
      if (v !== null) payload[k] = v;
    }
    if (!payload["hash"] || !payload["id"]) {
      setStatus("error");
      setMessage("Telegram returned an empty payload. Try again, or pick another sign-in method.");
      return;
    }

    const isLinkMode = params.get("mode") === "link";

    (async () => {
      try {
        if (isLinkMode) {
          const res = await fetch("/api/account/link/telegram", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ payload: JSON.stringify(payload) }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            setStatus("error");
            setMessage(body.error ?? `Link failed (${res.status})`);
            return;
          }
          router.replace("/account?linked=telegram");
          return;
        }
        const result = await signIn("telegram", {
          payload: JSON.stringify(payload),
          redirect: false,
        });
        if (result?.error) {
          setStatus("error");
          setMessage(result.error);
          return;
        }
        setStatus("ok");
        // Land back on the app shell. replace() so the callback URL
        // doesn't sit in browser history.
        router.replace("/app");
      } catch (err) {
        setStatus("error");
        setMessage((err as Error).message);
      }
    })();
  }, [params, router]);

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
            width: 10,
            height: 10,
            borderRadius: 10,
            background: status === "error" ? TOKENS.neg : TOKENS.accent,
            margin: "0 auto 14px",
            boxShadow: `0 0 12px ${status === "error" ? TOKENS.neg : TOKENS.accent}`,
            animation: status === "working" ? "heroPulse 1.4s ease-in-out infinite" : undefined,
          }}
        />
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
          {status === "ok" ? "Signed in" : status === "error" ? "Sign-in failed" : "Telegram"}
        </div>
        <div style={{ fontSize: 12, color: TOKENS.textSec, lineHeight: 1.5 }}>
          {message}
        </div>
        {status === "error" && (
          <button
            onClick={() => router.replace("/app")}
            style={{
              marginTop: 16,
              background: TOKENS.panel2,
              border: `1px solid ${TOKENS.borderHi}`,
              color: TOKENS.text,
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 600,
              padding: "8px 14px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Back to app
          </button>
        )}
      </div>
    </main>
  );
}
