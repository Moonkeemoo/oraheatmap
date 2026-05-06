"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { TOKENS } from "@/lib/tokens";

/**
 * Top-left dropdown — global navigation + signed-in identity card. Replaced
 * the standalone UserChip; clicking the burger now reveals an account
 * header (avatar + name + email + provider badge) followed by the menu
 * items, the way most consumer apps lay it out.
 *
 * Props:
 *   onRequestLogin — fires when the (unauthed) "Sign in" item is clicked.
 *                    Optional so legacy callers (landing Nav) can omit it
 *                    and the item is hidden.
 */
export function BurgerMenu({ onRequestLogin }: { onRequestLogin?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, [open]);

  const isAuthed = Boolean(session?.user?.id);
  const userId = (session?.user?.id as string | undefined) ?? null;
  const userName = (session?.user?.name as string | undefined) ?? null;
  const userEmail = (session?.user?.email as string | undefined) ?? null;
  const userImage = (session?.user?.image as string | undefined) ?? null;
  const sessionProvider = (session as { provider?: string } | null)?.provider ?? null;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent",
          border: `1px solid ${TOKENS.border}`,
          color: TOKENS.text,
          width: 34,
          height: 34,
          borderRadius: 8,
          cursor: "pointer",
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          padding: 0,
          transition: "background .12s, border-color .12s",
          position: "relative",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = TOKENS.panel;
          (e.currentTarget as HTMLButtonElement).style.borderColor = TOKENS.borderHi;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          (e.currentTarget as HTMLButtonElement).style.borderColor = TOKENS.border;
        }}
      >
        <span style={{ width: 16, height: 1.5, background: TOKENS.text, borderRadius: 1 }} />
        <span style={{ width: 16, height: 1.5, background: TOKENS.text, borderRadius: 1 }} />
        <span style={{ width: 16, height: 1.5, background: TOKENS.text, borderRadius: 1 }} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            // Align to whichever edge has more room. Placed on the LEFT
            // here because the burger sits in the header's left corner.
            left: 0,
            minWidth: 240,
            background: TOKENS.panel,
            border: `1px solid ${TOKENS.borderHi}`,
            borderRadius: 10,
            boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
            padding: 6,
            zIndex: 50,
            animation: "burgerIn .12s ease-out",
            fontFamily: TOKENS.font,
          }}
        >
          {/* Identity card — only when authed */}
          {isAuthed && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 10px 12px",
                }}
              >
                <Avatar image={userImage} fallback={userName || userEmail || userId || "?"} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: TOKENS.text,
                      fontFamily:
                        userName?.startsWith("0x") || (!userName && userId?.startsWith("0x"))
                          ? TOKENS.mono
                          : TOKENS.font,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {displayName(userName, userEmail, userId)}
                  </div>
                  {(userEmail || sessionProvider) && (
                    <div
                      style={{
                        fontSize: 10,
                        color: TOKENS.textMuted,
                        fontFamily: TOKENS.mono,
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {userEmail ?? `via ${sessionProvider}`}
                    </div>
                  )}
                </div>
              </div>
              <div style={DIVIDER_STYLE} />
            </>
          )}

          {/* Items */}
          {!isAuthed && onRequestLogin && (
            <ItemButton
              label="Sign in"
              accent
              onClick={() => {
                setOpen(false);
                onRequestLogin();
              }}
            />
          )}
          {isAuthed && (
            <ItemLink label="Profile" href="/account" onClose={() => setOpen(false)} />
          )}
          <ItemButton label="Pro · coming" disabled />
          <div style={DIVIDER_STYLE} />
          <ItemLink label="Privacy" href="/privacy" onClose={() => setOpen(false)} />
          <ItemLink label="Terms" href="/terms" onClose={() => setOpen(false)} />
          <ItemLink
            label="Follow on X"
            href="https://x.com/oralabxyz"
            external
            onClose={() => setOpen(false)}
          />
          <ItemLink
            label="Send feedback"
            href="mailto:hello@oralab.xyz"
            external
            onClose={() => setOpen(false)}
          />
          {isAuthed && (
            <>
              <div style={DIVIDER_STYLE} />
              <ItemButton
                label="Sign out"
                danger
                onClick={() => {
                  setOpen(false);
                  void signOut({ callbackUrl: "/" });
                }}
              />
            </>
          )}

          <style>{`
            @keyframes burgerIn {
              from { opacity: 0; transform: translateY(-4px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}

function displayName(name: string | null, email: string | null, id: string | null): string {
  const raw = name || email || id || "guest";
  if (raw.startsWith("0x") && raw.length >= 12) return `${raw.slice(0, 6)}…${raw.slice(-4)}`;
  return raw;
}

function Avatar({ image, fallback }: { image: string | null; fallback: string }) {
  const initial = fallback.replace(/^@/, "").charAt(0).toUpperCase() || "?";
  if (image) {
    return (
      <img
        src={image}
        alt=""
        width={32}
        height={32}
        style={{
          width: 32,
          height: 32,
          borderRadius: 32,
          objectFit: "cover",
          flexShrink: 0,
          background: TOKENS.panel2,
        }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        width: 32,
        height: 32,
        borderRadius: 32,
        background: "linear-gradient(135deg, #f0b429, #f85149)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#1a1410",
        fontWeight: 700,
        fontSize: 13,
        flexShrink: 0,
        fontFamily: TOKENS.mono,
      }}
    >
      {initial}
    </span>
  );
}

const DIVIDER_STYLE: React.CSSProperties = {
  height: 1,
  background: TOKENS.border,
  margin: "5px 6px",
};

function itemBaseStyle(opts: { disabled?: boolean; danger?: boolean; accent?: boolean }): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    background: opts.accent ? TOKENS.accent : "transparent",
    border: "none",
    color: opts.accent
      ? "#1a1410"
      : opts.disabled
        ? TOKENS.textMuted
        : opts.danger
          ? TOKENS.neg
          : TOKENS.text,
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: opts.accent ? 700 : 500,
    textAlign: "left",
    padding: "8px 10px",
    borderRadius: 6,
    cursor: opts.disabled ? "default" : "pointer",
    textDecoration: "none",
    transition: "background .1s, filter .1s",
  };
}

function ItemButton({
  label,
  onClick,
  disabled,
  danger,
  accent,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={itemBaseStyle({ disabled, danger, accent })}
      onMouseEnter={(e) => {
        if (disabled) return;
        if (accent) {
          (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.1)";
        } else {
          (e.currentTarget as HTMLButtonElement).style.background = TOKENS.panel2;
        }
      }}
      onMouseLeave={(e) => {
        if (accent) {
          (e.currentTarget as HTMLButtonElement).style.filter = "none";
        } else {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }
      }}
    >
      {label}
    </button>
  );
}

function ItemLink({
  label,
  href,
  external,
  onClose,
}: {
  label: string;
  href: string;
  external?: boolean;
  onClose: () => void;
}) {
  const style = itemBaseStyle({});
  const onEnter = (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.background = TOKENS.panel2;
  };
  const onLeave = (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.background = "transparent";
  };
  return external ? (
    <a href={href} style={style} onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClose}>
      {label}
    </a>
  ) : (
    <Link href={href} style={style} onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClose}>
      {label}
    </Link>
  );
}
