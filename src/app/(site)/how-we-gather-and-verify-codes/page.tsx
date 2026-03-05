import type { Metadata } from "next";
import "@/styles/article-content.css";
import { SITE_NAME, SITE_URL, buildAlternates } from "@/lib/seo";

const title = "How We Gather and Verify Codes";
const description = "Learn how Bloxodes finds, verifies, and keeps Roblox codes accurate for players.";
const canonical = `${SITE_URL.replace(/\/$/, "")}/how-we-gather-and-verify-codes`;
const ogImage = `${SITE_URL}/og-image.png`;

export const metadata: Metadata = {
  title,
  description,
  alternates: buildAlternates(canonical),
  openGraph: {
    type: "website",
    url: canonical,
    title,
    description,
    siteName: SITE_NAME,
    images: [ogImage]
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImage]
  }
};

export default function HowWeGatherAndVerifyCodesPage() {
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: canonical,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL
    }
  });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.25fr)]">
      <article className="article-content prose dark:prose-invert max-w-none game-copy">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">How We Gather and Verify Codes</h1>

        <p>
          Bloxodes is a Roblox codes and information hub where we track, verify, and list down working and active codes for various Roblox
          games. Our process is partly automated. It collects new codes from developers’ official community channels like Discord, social
          media handles, and other trusted public sources across the web.
        </p>

        <p>
          Once gathered, our team of six (<a href="/authors">meet the team</a>) manually verifies whether each code is still active. If it
          works, we record the reward it gives, label it as “new,” and publish it on the site. We do this three to four times a day to ensure
          our code lists stay accurate and up to date.
        </p>

        <p>
          Codes older than three days automatically lose their “new” tag. From time to time, we also recheck older codes. Once a code stops
          working, we immediately move it to the Expired Codes section.
        </p>

        <p>
          We aim to add and remove codes as quickly as possible so you always get reliable, working ones. Still, mistakes can happen. If you
          find a code that no longer works or discover a new one we missed, please <a href="/contact">contact us</a>. We will verify and update
          it right away.
        </p>

        <p>
          Maintaining accurate code lists is our daily mission, and we truly appreciate your help in keeping Bloxodes the most reliable Roblox
          code hub.
        </p>

        <p>Team Bloxodes</p>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      </article>

      <aside aria-hidden className="hidden lg:block" />
    </div>
  );
}
