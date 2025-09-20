import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Editorial Guidelines";
const description = "See how Bloxodes researches, verifies, and maintains every Roblox code guide.";

export const metadata: Metadata = {
  title: `${title} | ${SITE_NAME}`,
  description,
  alternates: { canonical: `${SITE_URL.replace(/\/$/, "")}/editorial-guidelines` }
};

export default function EditorialGuidelinesPage() {
  return (
    <article className="prose dark:prose-invert max-w-3xl space-y-6">
      <header>
        <h1>{title}</h1>
        <p>
          These principles keep our code listings accurate, transparent, and useful for Roblox players around the world.
        </p>
      </header>

      <section>
        <h2>Sourcing & Verification</h2>
        <ul>
          <li>Track official developer announcements, Discord servers, livestreams, and in-game notices daily.</li>
          <li>Redeem every working code in-game or confirm screenshots from trusted community testers.</li>
          <li>Label uncertain reports as “Needs Check” until a staff member verifies them.</li>
        </ul>
      </section>

      <section>
        <h2>Update Cadence</h2>
        <p>
          Codes pages refresh every time a new drop is confirmed or an old reward expires. Routine scans are logged as the
          page&apos;s “Last checked” date, while the structured data only changes when real content updates occur.
        </p>
      </section>

      <section>
        <h2>Corrections</h2>
        <p>
          Mistakes happen. When readers flag an issue via the <Link href="/contact">contact page</Link>, we investigate
          within one business day. Confirmed corrections include a timestamped note and, when relevant, credit for the tip.
        </p>
      </section>

      <section>
        <h2>Attribution & Ethics</h2>
        <p>
          We link to the original developer channels when they share codes first and clearly mark sponsored placements.
          Contributors must disclose any developer relationships before publishing coverage.
        </p>
      </section>

      <section>
        <h2>Reviewer Expertise</h2>
        <p>
          Each writer maintains expertise in their assigned genres and keeps an active Roblox account to validate rewards.
          You can check author credentials on the <Link href="/authors">author listing</Link>.
        </p>
      </section>

      <section>
        <h2>Staying Transparent</h2>
        <p>
          These guidelines evolve alongside Roblox and community expectations. Significant adjustments will be noted here
          with a revision date so you always know how the team operates.
        </p>
      </section>
    </article>
  );
}
