import Image from "next/image";

// Slim, single-row footer for the full-height app views (playground / match) so
// the simulation columns can fill the viewport without the page scrolling.
export function CompactFooter() {
  return (
    <footer className="border-t bg-background/75 backdrop-blur">
      <div className="text-muted-foreground mx-auto flex h-10 max-w-7xl items-center justify-between gap-3 px-4 text-xs">
        <span className="truncate">
          Matches are simulated for fun — no results are official.
        </span>
        <a
          href="http://github.com/tantara/worldcup-sim"
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground inline-flex shrink-0 items-center gap-1.5 font-medium transition-colors"
        >
          <GitHubIcon className="size-3.5" />
          GitHub
        </a>
      </div>
    </footer>
  );
}

export function Footer() {
  return (
    <footer className="border-t bg-background/75 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <div className="flex items-center gap-2">
            <Image
              src="/favicon.svg"
              alt=""
              width={20}
              height={20}
              className="size-5"
              aria-hidden="true"
            />
            <span>WorldCup Simulator</span>
          </div>
          <p>Matches are simulated for fun — no results are official.</p>
        </div>
        <a
          href="http://github.com/tantara/worldcup-sim"
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground inline-flex items-center gap-1.5 font-medium transition-colors"
        >
          <GitHubIcon className="size-4" />
          GitHub
        </a>
      </div>
    </footer>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.34 9.34 0 0 1 12 6.99c.85 0 1.7.12 2.5.35 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.49A10.07 10.07 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}
