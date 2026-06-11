import Link from "next/link";
import Image from "next/image";

import { AuthNav } from "~/components/auth-nav";
import { ModeToggle } from "~/components/mode-toggle";
import { auth } from "~/server/auth";

export async function Navbar() {
  const session = await auth();

  return (
    <header className="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-50 w-full border-b shadow-[0_1px_0_oklch(1_0_0/8%)] backdrop-blur">
      <div className="mx-auto grid h-14 max-w-7xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-2.5 sm:px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2 font-bold">
          <Image
            src="/worldcupsim-logo.svg"
            alt="WorldCup Simulator"
            width={228}
            height={56}
            className="h-8 w-auto max-w-[8.5rem] sm:h-9 sm:max-w-[14.25rem]"
            priority
          />
        </Link>
        <nav className="flex items-center justify-center">
          <Link
            href="/simulator"
            className="text-muted-foreground hover:border-border hover:bg-card/70 hover:text-foreground rounded-md border border-transparent px-2 py-1.5 text-sm font-medium transition-colors sm:px-3"
          >
            Simulator
          </Link>
        </nav>
        <nav className="flex min-w-0 items-center justify-end gap-0.5 sm:gap-1">
          <AuthNav user={session?.user} />
          <ModeToggle />
        </nav>
      </div>
    </header>
  );
}
