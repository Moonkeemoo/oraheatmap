"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { TOKENS } from "@/lib/tokens";

/**
 * Shared shell for the right-side / bottom-sheet drawers across the
 * app. Was previously copy-pasted in five places (Tooltip drawer,
 * WhaleDrawer, WhaleCellDrawer, MobileFiltersSheet, TG callback) —
 * each carrying its own backdrop + fixed-position aside + ESC handler
 * + drawerIn/drawerInBottom keyframes. This component centralises:
 *
 *   - Mobile: bottom sheet (100vw, max-height 85vh, top-rounded,
 *             slide-up animation, safe-area-inset bottom padding)
 *   - Desktop: right side drawer (min(440px, 92vw), full-height,
 *             slide-from-right animation)
 *   - Backdrop with click-to-close + dim background
 *   - ESC keydown closes
 *   - Click-outside via backdrop ; stopPropagation on the panel
 *
 * Caller renders header / body / sticky chrome inside the drawer's
 * children — primitives don't try to be overly opinionated about
 * what goes inside, only about the shell shape and lifecycle.
 *
 * Use `style` to override the panel's box (e.g. desktop width 380px
 * for a wider profile drawer), but most callers should just accept
 * the defaults.
 */

export function Drawer({
  open,
  onClose,
  children,
  zIndex = 51,
  panelStyle,
  backdropOpacity = 0.45,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Stack on top of LoginModal etc. when nested. Default 51. */
  zIndex?: number;
  /** Extra inline style applied to the panel; merged after the
   *  variant defaults so callers can tweak width / max-height etc. */
  panelStyle?: CSSProperties;
  /** Backdrop alpha — 0..1. Default 0.45. */
  backdropOpacity?: number;
}) {
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const baseStyle: CSSProperties = isMobile
    ? {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        maxHeight: "85vh",
        background: TOKENS.panel,
        borderTop: `1px solid ${TOKENS.borderHi}`,
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        boxShadow: "0 -20px 60px rgba(0,0,0,0.6)",
        zIndex,
        display: "flex",
        flexDirection: "column",
        fontFamily: TOKENS.font,
        color: TOKENS.text,
        animation: "drawerInBottom .22s ease-out",
        overflowY: "auto",
      }
    : {
        position: "fixed",
        top: 0,
        right: 0,
        width: "min(440px, 92vw)",
        height: "100vh",
        background: TOKENS.panel,
        borderLeft: `1px solid ${TOKENS.borderHi}`,
        boxShadow: "-20px 0 60px rgba(0,0,0,0.6)",
        zIndex,
        display: "flex",
        flexDirection: "column",
        fontFamily: TOKENS.font,
        color: TOKENS.text,
        animation: "drawerIn .18s ease-out",
        overflowY: "auto",
      };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: `rgba(0,0,0,${backdropOpacity})`,
          zIndex: zIndex - 1,
          animation: "tipIn .18s ease-out",
        }}
      />
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{ ...baseStyle, ...panelStyle }}
      >
        {children}
      </aside>
      <style>{`
        @keyframes drawerIn {
          0% { transform: translateX(20px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes drawerInBottom {
          0% { transform: translateY(40px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
