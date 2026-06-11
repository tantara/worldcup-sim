"use client";

import { usePathname } from "next/navigation";

import { Footer } from "~/components/footer";

// Full-height, app-like routes (the agent playground and per-match views) hide
// the marketing footer so the three simulation columns can fill the viewport.
export function ConditionalFooter() {
  const pathname = usePathname();
  const hideFooter =
    pathname === "/playground" || pathname.startsWith("/match");
  if (hideFooter) return null;
  return <Footer />;
}
