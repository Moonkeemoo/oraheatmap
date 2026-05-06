"use client";

import { useEffect, useState } from "react";

/** Single mobile breakpoint. Below this width every responsive
 *  component switches to mobile layout — stacked controls, heat-only
 *  cells, bottom-sheet drawers, etc. Tablet 769-1023 currently uses
 *  the same layout as desktop; revisit when an iPad-class user shows
 *  up in analytics. */
export const MOBILE_MAX_WIDTH = 768;

/**
 * Reactive viewport-width check. SSR-safe — returns `false` on the
 * server (default to desktop) so the first paint matches what most
 * crawlers / share-card renderers will see; the post-mount effect
 * corrects to the real value within ms.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
    const update = (): void => setIsMobile(mql.matches);
    update();
    // Modern API; older Safari uses addListener / removeListener.
    if (mql.addEventListener) {
      mql.addEventListener("change", update);
      return () => mql.removeEventListener("change", update);
    }
    mql.addListener(update);
    return () => mql.removeListener(update);
  }, []);

  return isMobile;
}
