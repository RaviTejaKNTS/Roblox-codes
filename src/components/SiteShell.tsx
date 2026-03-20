import { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Inter } from "next/font/google";
import { HeaderControls } from "@/components/HeaderControls";

type SiteShellProps = {
  children: ReactNode;
  integrations?: ReactNode;
};

const inter = Inter({
  subsets: ["latin"],
  display: "swap"
});

export function SiteShell({ children, integrations = null }: SiteShellProps) {
  const currentYear = new Date().getFullYear();

  return (
    <>
      {integrations}
      <div className={`${inter.className} flex min-h-screen flex-col`}>
        <header className="sticky top-0 z-40 border-b border-border/60 bg-surface/95 backdrop-blur">
          <div className="container flex items-center justify-between gap-4 py-4 md:gap-6">
            <Link href="/" className="flex items-end gap-3 shrink-0" aria-label="Bloxodes home">
              <Image
                src="/Bloxodes-dark.png"
                alt="Bloxodes"
                width={948}
                height={319}
                priority
                className="hidden h-9 w-auto shrink-0 dark:block"
              />
              <Image
                src="/Bloxodes-light.png"
                alt="Bloxodes"
                width={948}
                height={319}
                loading="lazy"
                fetchPriority="low"
                className="block h-9 w-auto shrink-0 dark:hidden"
              />
            </Link>
            <HeaderControls />
          </div>
        </header>
        <main className="container flex-1 py-10">{children}</main>
        <footer className="mt-16 border-t border-border/60">
          <div className="container flex flex-col gap-6 py-8 text-sm text-muted md:flex-row md:items-center md:justify-between">
            <Link href="/" className="flex items-center gap-3 text-foreground">
              <div className="relative h-8 w-auto">
                <Image
                  src="/Bloxodes-dark.png"
                  alt="Bloxodes"
                  width={948}
                  height={319}
                  loading="lazy"
                  fetchPriority="low"
                  className="hidden h-8 w-auto dark:block"
                />
                <Image
                  src="/Bloxodes-light.png"
                  alt="Bloxodes"
                  width={948}
                  height={319}
                  loading="lazy"
                  fetchPriority="low"
                  className="block h-8 w-auto dark:hidden"
                />
              </div>
            </Link>
            <nav className="flex flex-wrap items-center gap-5 text-xs uppercase tracking-wide text-muted md:text-sm">
              <Link href="/about" className="transition hover:text-foreground">
                About Us
              </Link>
              <Link href="/how-we-gather-and-verify-codes" className="transition hover:text-foreground">
                How We Verify Codes
              </Link>
              <Link href="/contact" className="transition hover:text-foreground">
                Contact Us
              </Link>
              <Link href="/editorial-guidelines" className="transition hover:text-foreground">
                Editorial Guidelines
              </Link>
              <Link href="/privacy-policy" className="transition hover:text-foreground">
                Privacy Policy
              </Link>
              <Link href="/terms-of-service" className="transition hover:text-foreground">
                Terms of Service
              </Link>
              <Link href="/disclaimer" className="transition hover:text-foreground">
                Disclaimer
              </Link>
            </nav>
            <div className="text-xs text-muted md:text-right">
              <p>© {currentYear} Bloxodes. Not affiliated with Roblox.</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
