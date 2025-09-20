import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Disclaimer";
const description = "Understand how Bloxodes verifies Roblox codes and why some listings may stop working.";
const canonical = `${SITE_URL.replace(/\/$/, "")}/disclaimer`;
const ogImage = `${SITE_URL}/og-image.png`;

export const metadata: Metadata = {
  title: `${title} | ${SITE_NAME}`,
  description,
  alternates: { canonical },
  openGraph: {
    type: "website",
    url: canonical,
    title: `${title} | ${SITE_NAME}`,
    description,
    siteName: SITE_NAME,
    images: [ogImage]
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} | ${SITE_NAME}`,
    description,
    images: [ogImage]
  }
};

export default function DisclaimerPage() {
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
    <article className="prose dark:prose-invert max-w-3xl space-y-6">
      <header>
        <h1>{title}</h1>
        <p>
          {SITE_NAME} finds and publishes Roblox codes in good faith so players can redeem active rewards quickly. Because
          developers retire or replace codes without notice, we cannot guarantee that every code will work for every
          player at all times.
        </p>
      </header>

      <section>
        <h2>What You Can Expect</h2>
        <ul>
          <li>Daily monitoring of official channels, community tips, and in-game updates.</li>
          <li>Verification attempts for each code before it appears in the active list.</li>
          <li>Clear labeling when a code is unverified, expiring soon, or needs additional testing.</li>
        </ul>
      </section>

      <section>
        <h2>When Codes Fail</h2>
        <p>
          Codes often have secret expiration timers, player-level requirements, or server-specific limits. If a code you
          try no longer works, it may have reached one of these conditions between our checks. We update listings as soon
          as we confirm the change.
        </p>
      </section>

      <section>
        <h2>How to Report Issues</h2>
        <p>
          Please share broken or newly discovered codes via <Link href="mailto:hello@bloxodes.com">hello@bloxodes.com</Link>
          or the <Link href="/contact">contact page</Link>. Include the exact code text, where you found it, and any
          screenshots so we can verify quickly.
        </p>
      </section>

      <section>
        <h2>No Guarantees</h2>
        <p>
          Using codes listed on {SITE_NAME} is at your own discretion. We provide this information as a public reference
          and do not promise specific in-game outcomes or rewards.
        </p>
      </section>

      <section>
        <h2>Stay Informed</h2>
        <p>
          For more detail on our editorial process, see the <Link href="/editorial-guidelines">editorial guidelines</Link>
          and <Link href="/privacy-policy">privacy policy</Link>.
        </p>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
    </article>
  );
}
