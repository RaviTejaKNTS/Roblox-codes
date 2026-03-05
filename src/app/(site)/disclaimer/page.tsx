import type { Metadata } from "next";
import "@/styles/article-content.css";
import { SITE_NAME, SITE_URL, buildAlternates } from "@/lib/seo";

const title = "Disclaimer";
const description = "Understand the limitations of Bloxodes.com and how we handle Roblox code information.";
const canonical = `${SITE_URL.replace(/\/$/, "")}/disclaimer`;
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.25fr)]">
      <article className="article-content prose dark:prose-invert max-w-none game-copy">
        <header className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Disclaimer from Bloxodes.com</h1>
          <p className="text-base text-muted sm:text-lg">Effective Date: January 31, 2026 · Last Updated: January 31, 2026</p>
          <p className="text-base text-muted sm:text-lg">
            Bloxodes.com provides Roblox codes, guides, and related information to help players enjoy their gaming experience. While we
            strive for accuracy and reliability, it is important for readers to understand the limitations of our service. This Disclaimer
            outlines the scope of our responsibility, the use of our content, and important notes on reliance.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">General Information Only</h2>
          <p>
            The content on Bloxodes.com is provided for <strong>general informational purposes only</strong>. While we do our best to keep
            codes and guides accurate and up to date, we cannot guarantee that every code will work for every user or that information will
            always remain current. Roblox codes are created and distributed by game developers, and they may expire or change without
            notice. We have no control over these external decisions.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">No Affiliation With Roblox</h2>
          <p>
            Bloxodes.com is an <strong>independent website</strong>. We are not affiliated with, endorsed by, or sponsored by Roblox
            Corporation or any game developer. All Roblox-related names, logos, images, and trademarks belong to their respective owners. We
            use them solely for identification and informational purposes under fair use principles.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Accuracy and Updates</h2>
          <p>
            We verify codes and content from reliable sources such as official developer channels, Discord servers, and social media
            accounts. However, errors may occur, and codes may expire between our checks. Readers should always confirm in-game whether a
            code is valid. We update content regularly but cannot promise real-time accuracy for every game and every code.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">No Professional Advice</h2>
          <p>
            The content on Bloxodes.com should not be interpreted as professional, legal, financial, or technical advice. It is purely
            informational and intended for entertainment and general guidance. If you require professional advice, you should consult a
            qualified individual in that field.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">User Responsibility</h2>
          <p>
            By using Bloxodes.com, you agree that you are responsible for how you use the information provided. This includes verifying codes
            in-game and using them at your own discretion. We strongly encourage users never to share their Roblox account credentials,
            passwords, or sensitive personal details with anyone claiming to provide codes or rewards.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Accounts and Roblox Linking</h2>
          <p>
            Accounts are optional and are provided to support features like comments, preferences, and Roblox linking. You are responsible
            for maintaining the confidentiality of your sign-in credentials and for activity under your account.
          </p>
          <p>
            If you choose to link a Roblox account, the connection uses Roblox&apos;s official OAuth flow. We never ask for or receive your
            Roblox password.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">External Links</h2>
          <p>
            Our site may contain links to third-party websites (for example, official developer Discords or social media). These links are
            provided for convenience and reference. We do not control these external sites and are not responsible for their content,
            accuracy, or privacy practices. We encourage you to review the privacy policies and terms of any external site you visit.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Bloxodes.com and its team are not liable for any damages, losses, or issues that may
            arise from:
          </p>
          <ul className="list-disc pl-6">
            <li>Use of or reliance on information provided on our website.</li>
            <li>Codes that fail to work, expire, or produce unexpected results.</li>
            <li>Technical issues such as downtime, errors, or broken links.</li>
            <li>Actions taken by third-party websites linked from Bloxodes.com.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Contact</h2>
          <p>
            If you have questions or concerns regarding this Disclaimer, please contact us at:
          </p>
          <p>
            <strong>Email:</strong> <a href="mailto:getbloxodes@gmail.com">getbloxodes@gmail.com</a>
            <br />
            <strong>Website:</strong>{' '}
            <a href="https://bloxodes.com" target="_blank" rel="noopener noreferrer">
              https://bloxodes.com
            </a>
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Summary</h2>
          <p>
            Bloxodes.com is a fan-made, independent platform providing Roblox code information as a convenience to players. We do our best to
            keep content accurate and up to date, but we cannot guarantee perfection. By using our site, you agree that you use the
            information at your own risk and that we are not liable for issues arising from its use.
          </p>
        </section>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      </article>

      <aside aria-hidden className="hidden lg:block" />
    </div>
  );
}
