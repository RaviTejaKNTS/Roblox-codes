import "./globals.css";
import { ReactNode } from "react";
import Image from "next/image";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, organizationJsonLd, siteJsonLd } from "@/lib/seo";

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

const siteStructuredData = JSON.stringify(siteJsonLd({ siteUrl: SITE_URL }));
const organizationStructuredData = JSON.stringify(organizationJsonLd({ siteUrl: SITE_URL }));

export const metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  generator: "Next.js",
  title: {
    default: `${SITE_NAME} — Active & Working Codes`,
    template: `%s · ${SITE_NAME}`
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "Roblox codes",
    "Roblox game codes",
    "Bloxodes",
    "gaming rewards",
    "promo codes"
  ],
  category: "Gaming",
  publisher: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      maxSnippet: -1,
      maxImagePreview: "large",
      maxVideoPreview: -1
    }
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Active & Working Codes`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — Roblox Codes`
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Active & Working Codes`,
    description: SITE_DESCRIPTION,
    creator: "@bloxodes",
    site: "@bloxodes",
    images: [`${SITE_URL}/og-image.png`]
  },
  alternates: {
    canonical: SITE_URL,
    types: { "application/rss+xml": `${SITE_URL}/feed.xml` }
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground transition-colors duration-300">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: siteStructuredData }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: organizationStructuredData }} />
        <header className="sticky top-0 z-40 border-b border-border/60 bg-surface/95 backdrop-blur">
          <div className="container flex items-center justify-between gap-6 py-4">
            <a href="/" className="flex items-end gap-3">
              <Image
                src="/Bloxodes-dark.png"
                alt="Bloxodes"
                width={948}
                height={319}
                priority
                className="hidden h-9 w-auto dark:block"
              />
              <Image
                src="/Bloxodes-light.png"
                alt="Bloxodes"
                width={948}
                height={319}
                priority
                className="block h-9 w-auto dark:hidden"
              />
              <span className="text-xs font-sans text-muted-foreground mb-[2px]">
                for Roblox Codes
              </span>
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
