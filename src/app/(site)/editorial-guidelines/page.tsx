import type { Metadata } from "next";
import "@/styles/article-content.css";
import { SITE_NAME, SITE_URL, buildAlternates } from "@/lib/seo";

const title = "Editorial Guidelines";
const description = "How Bloxodes.com researches, verifies, and updates Roblox code coverage.";
const canonical = `${SITE_URL.replace(/\/$/, "")}/editorial-guidelines`;
const ogImage = `${SITE_URL}/og-image.png`;

export const metadata: Metadata = {
  title,
  description,
  alternates: buildAlternates(canonical),
  openGraph: {
    type: "article",
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

export default function EditorialGuidelinesPage() {
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
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Editorial Guidelines of Bloxodes.com</h1>
          <p className="text-base text-muted sm:text-lg">
            Effective Date: October 3, 2025 · Last Updated: October 3, 2025
          </p>
          <p className="text-base text-muted sm:text-lg">
            At Bloxodes.com, our commitment is to deliver clear, accurate, and trustworthy information to Roblox players worldwide. Our
            editorial guidelines explain how we research, write, review, and update content. These rules ensure that every article and code
            list you read on our site meets the highest standards of accuracy, transparency, and fairness.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Accuracy and Verification</h2>
          <p>
            We understand that Roblox players rely on our site to find working codes that provide in-game rewards. For this reason, accuracy
            is at the core of our editorial standards. Every active code published on Bloxodes.com is verified against reliable sources such
            as official Roblox developer announcements, verified Discord servers, or game-specific social media accounts like Twitter/X. In
            cases where a code may be unconfirmed, uncertain, or potentially expired, we place it in a <strong>“Check”</strong> category with
            clear labeling so readers know to test it in-game before relying on it.
          </p>
          <p>
            Expired codes are not removed entirely but instead moved to a dedicated section. This way, players can confirm for themselves
            whether an old code might still work and can also keep track of past releases.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Transparency With Readers</h2>
          <p>
            We are transparent in how we create content. Every codes page displays a <strong>“Last Updated”</strong> date so readers know
            when the information was last checked. This helps players judge whether a page reflects the most recent changes in their favorite
            Roblox game.
          </p>
          <p>
            We do not exaggerate rewards, mislead players about game benefits, or include fabricated content. If we ever cover sponsored
            material, it will be clearly disclosed to maintain honesty with our readers.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Independence</h2>
          <p>
            Bloxodes.com operates independently and is not affiliated with Roblox Corporation or any specific game developers. We do not
            accept payment in exchange for featuring or prioritizing codes. Our editorial decisions are based solely on what is best for
            players seeking accurate and timely information.
          </p>
          <p>
            When we cite sources, such as official Discord channels or developer Twitter/X accounts, we do so to give credit where it is due
            and to maintain accountability. This also helps our readers understand the origin of the information they see.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Content Standards</h2>
          <p>
            Our content is written for Roblox players of all ages, so clarity is essential. We use simple and direct language so that both
            new and experienced players can quickly understand how to redeem codes and claim rewards. Step-by-step instructions are provided
            wherever possible, particularly in our <strong>“How to Redeem”</strong> sections, and troubleshooting tips are included when
            players commonly face issues.
          </p>
          <p>Code pages follow a consistent structure across the site:</p>
          <ul className="list-disc pl-6">
            <li>Active Codes</li>
            <li>Expired Codes</li>
            <li>Codes to Double-Check (if applicable)</li>
            <li>How to Redeem Codes</li>
            <li>Troubleshooting or extra guidance</li>
          </ul>
          <p>This consistency helps readers quickly find what they are looking for without confusion.</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Regular Updates</h2>
          <p>
            Roblox codes change frequently, and players expect us to stay ahead. To meet this expectation, our editors use both manual checks
            and automated monitoring tools to track new code releases and expired ones. We aim to update each codes page as quickly as
            possible, often within hours of a new code dropping. Outdated or broken pages are promptly corrected or improved.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Reader Engagement</h2>
          <p>
            While we do not have comments or forums on Bloxodes.com, we value our readers’ input. Players can always reach us at{' '}
            <a href="mailto:getbloxodes@gmail.com">getbloxodes@gmail.com</a> to report an expired code, suggest improvements, or ask
            questions. Every email is reviewed, and where necessary, we update our content based on user feedback. In this way, our readers
            directly help us maintain accuracy and completeness.
          </p>
          <p>We also encourage users to include details when contacting us, such as the game name and the specific code, to speed up our verification process.</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Ethics and Safety</h2>
          <p>
            We hold ourselves accountable to strong ethical standards. All content on Bloxodes.com is created with safety in mind. We never
            publish harmful links, misleading downloads, or request Roblox account credentials. Our guides are designed solely to help
            players enjoy their games, not to exploit them.
          </p>
          <p>
            We also comply with global privacy and child-safety laws, including GDPR (EU), CCPA (California), COPPA (U.S. children’s
            protection), and India’s DPDP Act. These rules are built into our editorial process, ensuring that players’ rights and safety are
            respected at all times.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Final Commitment</h2>
          <p>
            Bloxodes.com exists to serve Roblox players by providing accurate, transparent, and safe information. Our editorial guidelines
            ensure that everything we publish is fact-checked, clearly presented, and regularly updated. By following these standards, we aim
            to be a trusted companion for every player looking for Roblox codes and guides.
          </p>
        </section>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      </article>

      <aside aria-hidden className="hidden lg:block" />
    </div>
  );
}
