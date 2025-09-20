import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Privacy Policy";
const description = "Learn how Bloxodes collects, uses, and protects information when you browse Roblox code guides.";
const canonical = `${SITE_URL.replace(/\/$/, "")}/privacy-policy`;
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

export default function PrivacyPolicyPage() {
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "PrivacyPolicy",
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
        <p>{description}</p>
      </header>

      <section>
        <h2>Information We Collect</h2>
        <p>
          {SITE_NAME} publishes guides and code roundups without requiring you to create an account. We collect only the
          data needed to keep the site fast and reliable, such as anonymized analytics, server logs, and the details you
          voluntarily share when you contact us.
        </p>
      </section>

      <section>
        <h2>How We Use Data</h2>
        <p>
          Usage metrics help us understand which game pages are most helpful, troubleshoot issues, and plan future
          coverage. Contact details supplied via email are used solely to respond to your request and are never sold or
          shared for marketing.
        </p>
      </section>

      <section>
        <h2>Cookies & Third Parties</h2>
        <p>
          We use lightweight analytics and caching services that may set cookies or store IP addresses to deliver
          aggregated statistics. These services do not track your activity across other websites.
        </p>
      </section>

      <section>
        <h2>Your Choices</h2>
        <p>
          You can disable cookies in your browser at any time. If you would like your contact messages or other personal
          information removed from our records, email us and we will confirm once the data has been deleted.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about this policy? Reach us at <Link href="mailto:hello@bloxodes.com">hello@bloxodes.com</Link> or via
          our <Link href="/contact">contact page</Link>.
        </p>
      </section>

      <section>
        <h2>Updates</h2>
        <p>
          We review this policy whenever we change the services we use or the way we gather analytics. Important updates
          will be dated on this page so you always know the latest version.
        </p>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
    </article>
  );
}
