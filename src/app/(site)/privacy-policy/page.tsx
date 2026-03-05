import type { Metadata } from "next";
import "@/styles/article-content.css";
import { SITE_NAME, SITE_URL, buildAlternates } from "@/lib/seo";

const title = "Privacy Policy";
const description =
  "Privacy policy for Bloxodes: account data, cookies, analytics, ads, and your rights.";
const canonical = `${SITE_URL.replace(/\/$/, "")}/privacy-policy`;
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.25fr)]">
      <article className="article-content prose dark:prose-invert max-w-none game-copy">
        <header className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">{title}</h1>
          <p className="text-base text-muted sm:text-lg">
            Privacy policy for Bloxodes: account data, cookies, analytics, ads, and your rights.
          </p>
        </header>

        <section className="space-y-4">
          <p>
            <strong>Effective Date:</strong> January 31, 2026
            <br />
            <strong>Last Updated:</strong> January 31, 2026
          </p>
          <p>
            Bloxodes.com ("Bloxodes," "we," "our," or "us") publishes Roblox guides, checklists, and tools. We designed this site to
            maximize privacy while still offering optional accounts for comments, personalization, and Roblox linking. Most pages can be
            used without signing in, but if you create an account we will collect the minimum data needed to run those features.
          </p>
          <p>
            This Privacy Policy explains the technical data we collect, how we use it, and your rights. We wrote this to align with global
            standards, including EU/UK GDPR, ePrivacy, California CCPA/CPRA, and other U.S. state privacy laws.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">1. What We Collect (and What We Don&apos;t)</h2>
          <div className="space-y-3">
            <div>
              <p className="font-medium">We do not collect:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Payment or billing information.</li>
                <li>Physical addresses, phone numbers, or government IDs.</li>
                <li>Your Roblox password or login credentials (we never ask for them).</li>
              </ul>
            </div>
            <div>
              <p className="font-medium">Account and profile data (only if you sign up):</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Email address for sign-in and account recovery.</li>
                <li>Authentication data managed by our auth provider (passwords are stored securely and never in plain text).</li>
                <li>Display name and preferences (such as theme).</li>
                <li>Roblox linking data you choose to connect (Roblox user ID, username, display name, avatar, and profile URL).</li>
                <li>Comments you post and the timestamps associated with them.</li>
              </ul>
              <p className="text-sm text-muted">
                Email verification is required before password-based sign-in is enabled.
              </p>
            </div>
            <div>
              <p className="font-medium">We may collect automatically (technical data):</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Device and network data: IP address, browser type, OS, referral URL, timestamps, pages visited.</li>
                <li>Usage data: page engagement (via Google Analytics). Vercel’s built-in analytics/performance telemetry runs on all visits but is aggregated and not used for marketing.</li>
                <li>Advertising identifiers: cookie IDs used by ad partners for frequency and fraud protection.</li>
              </ul>
            </div>
            <div>
              <p className="font-medium">Direct interactions:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Email: If you email us, we receive your address and message to reply. We do not add you to marketing lists.</li>
                <li>
                  Checklists and tools: Your progress is stored in your browser&apos;s local storage and stays on your device unless a
                  feature explicitly saves it to your account.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">2. Advertising and Ad Partner Policies</h2>
          <p>We use advertising partners, including Mediavine Journey, to display ads so we can offer our content for free.</p>
          <p>
            Third-party vendors may use cookies and similar technologies to serve ads based on your visits to this and other sites, measure
            performance, and help prevent fraud.
          </p>
          <p>
            Learn how Mediavine handles advertising data:{" "}
            <a href="https://www.mediavine.com/privacy-policy/" target="_blank" rel="noopener noreferrer">
              https://www.mediavine.com/privacy-policy/
            </a>
          </p>
          <p>
            Manage your ad preferences or opt out of personalized ads:
            <br />
            <a href="https://www.aboutads.info/choices" target="_blank" rel="noopener noreferrer">
              https://www.aboutads.info/choices
            </a>
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">3. Analytics</h2>
          <p>
            <strong>Google Analytics 4 (GA4):</strong> used to understand aggregate usage (popular pages, approximate regions). GA4 uses
            cookies to generate anonymous usage stats. We enable IP anonymization where possible and do not link this data to identities.
          </p>
          <p>
            <strong>Vercel Analytics and Speed Insights:</strong> used for performance and error monitoring. These run by default for all visitors, are aggregated/anonymized, and are not used for ads or profiling.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">4. Cookies and Local Storage</h2>
          <div className="space-y-2">
            <p className="font-medium">Essential / functional:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Authentication/session cookies (so you stay signed in).</li>
              <li>Theme preference (cookie + account preference when signed in).</li>
              <li>Checklist progress for guides and tools (stored in local storage).</li>
              <li>Consent state so we do not ask on every page.</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="font-medium">Analytics and advertising cookies:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Set by analytics providers and ad partners to measure views, clicks, ad delivery, and prevent fraud.</li>
            </ul>
          </div>
          <p>
            Manage your preferences on our{" "}
            <a href="/cookie-settings" className="text-primary underline-offset-4 hover:underline">
              cookie settings
            </a>{" "}
            page, or block/delete cookies in your browser. Clearing cookies will reset checklist progress and theme preferences and sign you
            out of your account.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">5. Data Sharing</h2>
          <p>We do not sell personal data. We share technical data only with providers that help run the site:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Google Analytics for usage measurement.</li>
            <li>Mediavine Journey and other ad partners for advertising delivery and measurement.</li>
            <li>Vercel for secure hosting, edge delivery, and performance monitoring (Analytics/Speed Insights run by default).</li>
            <li>Supabase for authentication, database storage, and account management.</li>
          </ul>
          <p>We may disclose information if required by law or to protect our rights and users.</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">6. International Data Transfers</h2>
          <p>
            Our providers process data globally, including in the United States. When data moves from the EU/UK to the US, providers rely on
            mechanisms like the Data Privacy Framework or Standard Contractual Clauses to protect it.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">7. Your Rights</h2>
          <div className="space-y-3">
            <p className="font-medium">EU/UK/Switzerland (GDPR):</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Non-essential analytics and ads are off by default until you accept.</li>
              <li>Withdraw consent anytime at the cookie settings page.</li>
              <li>Access, correction, or deletion: manage profile details in your account, or contact us to request deletion.</li>
            </ul>

            <p className="font-medium">United States (California, Virginia, Colorado, etc.):</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Opt out of targeted ads and analytics via the cookie settings page.</li>
              <li>We do not share personal info for third-party direct marketing.</li>
              <li>You may request access or deletion of account data by contacting us.</li>
            </ul>

            <p className="font-medium">India (DPDP Act 2023):</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>You have grievance redressal rights. Contact us at the email below.</li>
            </ul>
          </div>
          <p>
            Manage or change your choices anytime on our{" "}
            <a href="/cookie-settings" className="text-primary underline-offset-4 hover:underline">
              cookie settings
            </a>{" "}
            page.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">8. Children&apos;s Privacy (COPPA)</h2>
          <p>
            Bloxodes is for a general audience aged 13 and older. We do not knowingly collect personal information from children under 13. If
            you believe a child provided data to us, email us and we will delete it.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">9. Account System and Roblox Linking</h2>
          <p>
            Creating an account is optional. If you sign in, you can use email/password (after verification) or Google. We store the minimum
            account data needed to run profiles, comments, and preferences.
          </p>
          <p>
            Linking a Roblox account uses Roblox&apos;s official OAuth flow and happens on Roblox domains. We never see your Roblox password.
            You can unlink your Roblox account at any time in your account settings.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">10. Bloxodes Chrome Extension</h2>
          <p>
            The Bloxodes Chrome Extension does not collect, store, transmit, or share personal data. It only retrieves publicly available
            Roblox game data (codes) and displays them. It contains no analytics or tracking code.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">11. Contact Us</h2>
          <p>
            <strong>Email:</strong> <a href="mailto:getbloxodes@gmail.com">getbloxodes@gmail.com</a>
            <br />
            <strong>Website:</strong>{" "}
            <a href="https://bloxodes.com" target="_blank" rel="noopener noreferrer">
              https://bloxodes.com
            </a>
          </p>
          <p>We may update this policy as our services or laws change. Check the Last Updated date above for the latest version.</p>
        </section>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      </article>

      <aside aria-hidden className="hidden lg:block" />
    </div>
  );
}
