import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist, Noto_Sans_KR } from "next/font/google";

import { ConditionalFooter } from "~/components/conditional-footer";
import { Navbar } from "~/components/navbar";
import { ThemeProvider } from "~/components/theme-provider";
import { env } from "~/env";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  metadataBase: new URL(
    env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "WorldCupSim",
    template: "%s · WorldCupSim",
  },
  description:
    "Explore groups, fixtures, venues, brackets, and unofficial match simulations for the 2026 World Cup.",
  icons: [
    { rel: "icon", url: "/favicon.svg", type: "image/svg+xml" },
    { rel: "alternate icon", url: "/favicon.ico" },
    { rel: "apple-touch-icon", url: "/apple-touch-icon.png" },
  ],
  openGraph: {
    title: "WorldCupSim",
    description:
      "A 2026 tournament control room for groups, fixtures, brackets, and match simulation.",
    url: "/",
    siteName: "WorldCupSim",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "WorldCupSim tournament simulation dashboard preview",
      },
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "WorldCupSim tournament simulation dashboard preview",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WorldCupSim",
    description:
      "A 2026 tournament control room for groups, fixtures, brackets, and match simulation.",
    images: ["/og-image.png"],
  },
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

// CJK (Korean/Japanese/Chinese) coverage. Large glyph set, so we skip preload
// and let it swap in; Latin still renders in Geist via the font-family stack.
const notoSansKr = Noto_Sans_KR({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-noto-kr",
  display: "swap",
  preload: false,
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${notoSansKr.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <TRPCReactProvider>
            <div className="app-shell flex min-h-screen flex-col bg-background">
              <Navbar />
              <div className="flex flex-1 flex-col">{children}</div>
              <ConditionalFooter />
            </div>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
