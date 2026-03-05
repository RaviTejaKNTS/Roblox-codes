import type { Metadata } from "next";
import "@/styles/article-content.css";
import { SITE_NAME, SITE_URL, buildAlternates } from "@/lib/seo";

const title = "Contact Us";
const description = "Find the best way to reach the Bloxodes.com team.";
const canonical = `${SITE_URL.replace(/\/$/, "")}/contact`;
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

export default function ContactPage() {
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: title,
    description,
    url: canonical,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "getbloxodes@gmail.com"
    }
  });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.25fr)]">
      <article className="article-content prose dark:prose-invert max-w-none game-copy">
        <header className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Contact Us: Bloxodes.com</h1>
          <p className="text-base text-muted sm:text-lg">
            At Bloxodes.com, we aim to make it easy for you to reach out whenever you need. Since our website is built to be simple and
            does not require accounts, comments, or sign-ups, the main way to get in touch with us is directly via email.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">How to Contact Us</h2>
          <ul className="list-disc pl-6">
            <li>
              <strong>Email:</strong>{' '}
              <a href="mailto:getbloxodes@gmail.com">getbloxodes@gmail.com</a>
              <br />
              This is our official contact address. Whether you have a question, want to report an error in one of our Roblox code pages, or
              have feedback on our site, drop us an email and we’ll get back to you as soon as possible.
            </li>
            <li>
              <strong>Website:</strong>{' '}
              <a href="https://bloxodes.com" rel="noopener noreferrer" target="_blank">
                https://bloxodes.com
              </a>
              <br />
              You can always visit our site for the latest updates. Important policy and legal pages such as the Privacy Policy and Terms of
              Service are always available at the bottom of our site.
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">What You Can Contact Us For</h2>
          <p>You are welcome to email us regarding:</p>
          <ul className="list-disc pl-6">
            <li>Reporting non-working or outdated Roblox codes.</li>
            <li>Suggestions for improving our coverage of Roblox games.</li>
            <li>Privacy questions or requests under GDPR, CCPA, India’s DPDP Act, or other laws.</li>
            <li>General feedback or inquiries about our site.</li>
          </ul>
          <p>
            We do not run newsletters or promotional emails, so you will never be automatically subscribed to anything. When you email us, we
            only use your information to reply to your query.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Response Time</h2>
          <p>
            We try to respond to all genuine messages within <strong>3–5 business days</strong>. Some requests, especially legal or
            data-related ones, may take longer but will always be handled within legally required timeframes.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Important Notes</h2>
          <ul className="list-disc pl-6">
            <li>Please do not send sensitive personal information (like passwords or payment details). We will never ask for them.</li>
            <li>
              For privacy and data rights requests, make sure you email us from the same address you used to contact us previously so we can
              verify your identity.
            </li>
            <li>
              For faster handling of Roblox code corrections, include the game name and the code in question.
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Final Assurance</h2>
          <p>
            Your trust is important to us. Contacting us will always be straightforward, safe, and private. We handle every message with
            respect and will never share your information beyond what is necessary to respond to your request.
          </p>
        </section>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      </article>

      <aside aria-hidden className="hidden lg:block" />
    </div>
  );
}
