"use client";

import { usePathname } from "next/navigation";

import { CompactFooter, Footer } from "~/components/footer";

// Full-height, app-like routes (the agent playground and per-match views) get a
// slim footer so the three simulation columns can fill the viewport without the
// page scrolling; everywhere else keeps the full marketing footer.
export function ConditionalFooter() {
  const pathname = usePathname();
  const compact =
    pathname === "/playground" || pathname.startsWith("/match");
  return compact ? <CompactFooter /> : <Footer />;
}
