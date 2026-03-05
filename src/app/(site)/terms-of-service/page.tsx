import type { Metadata } from "next";
import "@/styles/article-content.css";
import { SITE_NAME, SITE_URL, buildAlternates } from "@/lib/seo";

const title = "Terms of Service";
const description =
  "Terms of Service for Bloxodes: account responsibilities, acceptable use, Roblox linking, and site policies.";
const canonical = `${SITE_URL.replace(/\/$/, "")}/terms-of-service`;
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

export default function TermsOfServicePage() {
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
        <header className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">{title}</h1>
          <p className="text-base text-muted sm:text-lg">
            Effective Date: January 30, 2026 · Last Updated: January 30, 2026
          </p>
          <p className="text-base text-muted sm:text-lg">
            These Terms of Service ("Terms") govern your access to and use of Bloxodes.com ("Bloxodes," "we," "our," or "us"). By using our
            site, you agree to these Terms and our Privacy Policy.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">1. About Bloxodes</h2>
          <p>
            Bloxodes provides Roblox-related guides, tools, checklists, and code information. We are an independent fan resource and are not
            affiliated with or endorsed by Roblox Corporation.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">2. Eligibility</h2>
          <p>
            You must be at least 13 years old to use this site. If you are under 18, you must have permission from a parent or guardian.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">3. Accounts and Sign-In</h2>
          <p>
            Some features require a Bloxodes account. You are responsible for maintaining the confidentiality of your sign-in credentials
            and for all activity that occurs under your account.
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>You must provide accurate and current information when creating or updating your account.</li>
            <li>You may link third-party accounts (such as Roblox) to your Bloxodes account to enable features.</li>
            <li>You can unlink a connected account at any time unless a feature requires it to remain linked.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">4. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Access or scrape data using automated tools in a way that harms performance or violates our policies.</li>
            <li>Attempt to bypass security measures, rate limits, or access controls.</li>
            <li>Use the site to post or transmit unlawful, abusive, or infringing content.</li>
            <li>Impersonate another person or misrepresent your affiliation.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">5. Content and Intellectual Property</h2>
          <p>
            Our content (including text, design, and original graphics) is owned by Bloxodes and may not be reproduced for commercial use
            without permission. Roblox names, logos, and related assets are trademarks of Roblox Corporation and are used for informational
            purposes only.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">6. Third-Party Links and Services</h2>
          <p>
            Our site may link to third-party websites (e.g., Roblox or developer channels). We do not control these sites and are not
            responsible for their content or policies. Your use of third-party sites is subject to their terms.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">7. Disclaimers</h2>
          <p>
            Bloxodes is provided on an "as is" and "as available" basis. We do not guarantee that codes will work, that content is always
            accurate, or that the site will be uninterrupted. Use the site at your own risk.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">8. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Bloxodes and its contributors will not be liable for any indirect, incidental, or
            consequential damages arising from your use of the site.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">9. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. The latest version will always be available on this page, and the "Last Updated"
            date will reflect the most recent change.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">10. Contact Us</h2>
          <p>
            <strong>Email:</strong> <a href="mailto:getbloxodes@gmail.com">getbloxodes@gmail.com</a>
            <br />
            <strong>Website:</strong>{" "}
            <a href="https://bloxodes.com" target="_blank" rel="noopener noreferrer">
              https://bloxodes.com
            </a>
          </p>
        </section>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      </article>

      <aside aria-hidden className="hidden lg:block" />
    </div>
  );
}
