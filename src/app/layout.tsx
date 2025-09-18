import "./globals.css";
import { ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

const themeScript = `(() => {
  const storageKey = "roblox-codes-theme";
  try {
    const stored = window.localStorage.getItem(storageKey);
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = stored === "light" || stored === "dark" ? stored : (prefersDark ? "dark" : "light");
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    root.dataset.theme = theme;
  } catch (error) {
    /* noop */
  }
})();`;

export const metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  title: {
    default: "Bloxodes — Active & Working Codes",
    template: "%s · Bloxodes"
  },
  description: "Find active and expired Roblox game codes with rewards, updated daily.",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "Bloxodes",
    title: "Bloxodes — Active & Working Codes",
    description: "Find active and expired Roblox game codes with rewards, updated daily."
  },
  twitter: {
    card: "summary_large_image",
    title: "Bloxodes — Active & Working Codes",
    description: "Find active and expired Roblox game codes with rewards, updated daily."
  },
  alternates: {
    types: { "application/rss+xml": "/feed.xml" }
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground transition-colors duration-300">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <header className="sticky top-0 z-40 border-b border-border/60 bg-surface/95 backdrop-blur">
          <div className="container flex items-center justify-between gap-6 py-4">
            <a href="/" className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">RC</span>
              <span>Bloxodes</span>
            </a>
            <div className="flex items-center gap-2">
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="container py-10">{children}</main>
        <footer className="mt-16 border-t border-border/60">
          <div className="container flex flex-col gap-2 py-8 text-sm text-muted md:flex-row md:items-center md:justify-between">
            <p>© {new Date().getFullYear()} Bloxodes (Unofficial). Not affiliated with Roblox.</p>
            <p className="text-xs">Crafted for players hunting verified game rewards.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
