import type { Metadata } from "next";
import "./globals.css";
import FluidBackground from "@/components/hud/FluidBackground";
import Sidebar from "@/components/hud/Sidebar";
import TopBar from "@/components/hud/TopBar";
import { ToastProvider } from "@/components/ToastProvider";
import { SolanaProvider } from "@/components/SolanaProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import Preloader from "@/components/Preloader";
import { SidebarProvider } from "@/components/SidebarContext";
import { MainContent } from "@/components/MainContent";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const metadata: Metadata = {
  title: "MoonFluxx — Launch, Trade & Discover Tokens",
  description: "The easiest way to launch, discover, and trade tokens across multiple chains. AI-powered. Community-first.",
  keywords: ["solana", "token launch", "memecoin", "DeFi", "crypto", "AI trading", "bonding curve", "MoonFluxx"],
  openGraph: {
    title: "MoonFluxx — Launch. Trade. Discover.",
    description: "AI-powered token launch platform. Create, discover, and trade tokens across Solana.",
    type: "website",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "MoonFluxx" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MoonFluxx — Launch. Trade. Discover.",
    description: "AI-powered token launch platform on Solana.",
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://api.fontshare.com/v2/css?f[]=clash-display@300,400,500,600,700&f[]=satoshi@400,500,700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Syne:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
        {/* Zero-flash theme initialization — runs before React hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('moonflux-theme');if(!t)t=window.matchMedia('(prefers-color-scheme:light)').matches?'light':'dark';document.documentElement.classList.remove('light','dark');document.documentElement.classList.add(t)}catch(e){document.documentElement.classList.add('dark')}})()`,
          }}
        />
      </head>
      <body
        className="antialiased min-h-screen overflow-x-clip bg-surface-base text-text-primary transition-colors duration-300"
      >
        <ThemeProvider>
          <SidebarProvider>
            <Preloader />
            <FluidBackground />
            
            {/* Grain overlay */}
            <div
              className="fixed inset-0 pointer-events-none z-0"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                opacity: 0.015,
                mixBlendMode: "overlay",
              }}
            />

            <SolanaProvider>
              <ToastProvider>
                {/* Top navigation bar */}
                <TopBar />

                {/* Left sidebar — desktop only */}
                <Sidebar />

                {/* Main content — dynamic padding based on sidebar state */}
                <ErrorBoundary>
                  <MainContent>
                    {children}
                  </MainContent>
                </ErrorBoundary>
              </ToastProvider>
            </SolanaProvider>
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
