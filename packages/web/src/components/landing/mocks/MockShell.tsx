import type { ReactNode } from "react";
import { TOKENS } from "@/lib/tokens";

/** Card chrome shared by all landing-feature mock visuals — keeps the
 *  outer shadow + border-radius + padding consistent so each mock looks
 *  like the same "preview pane" on the page. */
export function MockShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: TOKENS.panel,
        border: `1px solid ${TOKENS.borderHi}`,
        borderRadius: 12,
        padding: 14,
        boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}
