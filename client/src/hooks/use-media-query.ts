"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Tracks a CSS media query. Returns `false` during SSR and the first client
 * render so markup matches the server, then updates after mount. Use this to
 * gate desktop-only affordances (e.g. resizable split panes) without hydration
 * mismatches.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
