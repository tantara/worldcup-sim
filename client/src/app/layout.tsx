import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist, Noto_Sans_KR } from "next/font/google";

import { Footer } from "~/components/footer";
import { Navbar } from "~/components/navbar";
import { ThemeProvider } from "~/components/theme-provider";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "World Cup Simulator",
  description: "Simulate World Cup matches with live text commentary.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
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
            <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-muted/30">
              <Navbar />
              <div className="flex flex-1 flex-col">{children}</div>
              <Footer />
            </div>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
