"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { TOKENS } from "@/lib/tokens";

/**
 * Top-right dropdown for global navigation. Lives next to the BrandLogo
 * in app Header / landing Nav. Items:
 *
 *   (authed) Profile                           → /account
 *   (always) Pro upgrade — coming soon         disabled placeholder
 *   (always) Privacy                           → /privacy
 *   (always) Terms                             → /terms
 *   (always) Send feedback                     mailto:hello@oralab.xyz
 *   (authed) Sign out                          NextAuth signOut()
 *
 * Closes on outside-click and Escape. Pointer-events on backdrop so menu
 * dismissal is one click anywhere.
 */
export function BurgerMenu() {
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();
  const isAuthed = Boolean(session?.user?.id);
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

  const items: ReadonlyArray<{
    label: string;
    href?: string;
    onClick?: () => void;
    disabled?: boolean;
    divider?: boolean;
    danger?: boolean;
    visible: boolean;
  }> = [
    { label: "Profile",       href: "/account",  visible: isAuthed },
    { label: "Pro · coming",  disabled: true,    visible: true },
    { label: "_divider",      divider: true,     visible: true },
    { label: "Privacy",       href: "/privacy",  visible: true },
    { label: "Terms",         href: "/terms",    visible: true },
    { label: "Send feedback", href: "mailto:hello@oralab.xyz",  visible: true },
    { label: "_divider",      divider: true,     visible: isAuthed },
    { label: "Sign out",      onClick: () => signOut(), danger: true, visible: isAuthed },
  ];

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
            right: 0,
            minWidth: 200,
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
          {items
            .filter((i) => i.visible)
            .map((item, idx) => {
              if (item.divider) {
                return (
                  <div
                    key={`d-${idx}`}
                    style={{
                      height: 1,
                      background: TOKENS.border,
                      margin: "5px 6px",
                    }}
                  />
                );
              }
              const baseStyle: React.CSSProperties = {
                display: "block",
                width: "100%",
                background: "transparent",
                border: "none",
                color: item.disabled
                  ? TOKENS.textMuted
                  : item.danger
                    ? TOKENS.neg
                    : TOKENS.text,
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 500,
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 6,
                cursor: item.disabled ? "default" : "pointer",
                textDecoration: "none",
                transition: "background .1s",
              };
              const onEnter = (e: React.MouseEvent<HTMLElement>) => {
                if (item.disabled) return;
                (e.currentTarget as HTMLElement).style.background = TOKENS.panel2;
              };
              const onLeave = (e: React.MouseEvent<HTMLElement>) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              };
              if (item.href) {
                const isExternal = item.href.startsWith("mailto:") || item.href.startsWith("http");
                return isExternal ? (
                  <a
                    key={item.label}
                    href={item.href}
                    style={baseStyle}
                    onMouseEnter={onEnter}
                    onMouseLeave={onLeave}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link
                    key={item.label}
                    href={item.href}
                    style={baseStyle}
                    onMouseEnter={onEnter}
                    onMouseLeave={onLeave}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              }
              return (
                <button
                  key={item.label}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    item.onClick?.();
                    setOpen(false);
                  }}
                  style={baseStyle}
                  onMouseEnter={onEnter}
                  onMouseLeave={onLeave}
                >
                  {item.label}
                </button>
              );
            })}
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
