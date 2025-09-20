import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Contact Us";
const description = "Get in touch with the Bloxodes team for tips, corrections, or partnership requests.";

export const metadata: Metadata = {
  title: `${title} | ${SITE_NAME}`,
  description,
  alternates: { canonical: `${SITE_URL.replace(/\/$/, "")}/contact` }
};

export default function ContactPage() {
  return (
    <article className="prose dark:prose-invert max-w-3xl space-y-6">
      <header>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      <section>
        <h2>Email</h2>
        <p>
          Send news tips, correction requests, or business questions to {" "}
          <Link href="mailto:hello@bloxodes.com">hello@bloxodes.com</Link>. We aim to reply within one business day.
        </p>
      </section>

      <section>
        <h2>Submit a Code Tip</h2>
        <p>
          Found a new code or spotted one that expired? Provide the details in your email—include the code text, where you
          saw it, and any reward screenshots. Credited contributors appear in our roundups once the code is verified.
        </p>
      </section>

      <section>
        <h2>Editorial Feedback</h2>
        <p>
          If something on the site is unclear or inaccurate, let us know so we can update the page and add a note in our
          <Link href="/editorial-guidelines">editorial guidelines</Link> log.
        </p>
      </section>

      <section>
        <h2>Business & Partnerships</h2>
        <p>
          We collaborate with Roblox developers and creators who want help communicating code drops or seasonal events.
          Pitch your ideas via email and we will schedule a follow-up call if it is a good fit.
        </p>
      </section>

      <section>
        <h2>Stay Connected</h2>
        <p>
          Follow us on X at <Link href="https://twitter.com/bloxodes">@bloxodes</Link> for real-time updates and
          publishing notes.
        </p>
      </section>
    </article>
  );
}
