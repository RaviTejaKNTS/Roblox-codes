import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "About Bloxodes";
const description = "Discover the mission behind Bloxodes and how our team keeps Roblox code lists accurate.";

export const metadata: Metadata = {
  title: `${title} | ${SITE_NAME}`,
  description,
  alternates: { canonical: `${SITE_URL.replace(/\/$/, "")}/about` }
};

export default function AboutPage() {
  return (
    <article className="prose dark:prose-invert max-w-3xl space-y-6">
      <header>
        <h1>{title}</h1>
        <p>
          {SITE_NAME} tracks Roblox experiences so players can redeem fresh rewards without sifting through expired or
          misleading codes.
        </p>
      </header>

      <section>
        <h2>Why We Built {SITE_NAME}</h2>
        <p>
          Roblox developers release codes at unpredictable times across Discord, social feeds, and livestreams. We created
          {" "}
          {SITE_NAME} to surface every legitimate drop in one reliable hub, complete with reward descriptions and
          redemption instructions.
        </p>
      </section>

      <section>
        <h2>How We Work</h2>
        <ul>
          <li>Monitor official game channels and communities daily.</li>
          <li>Verify working codes in-game or with trusted community testers.</li>
          <li>Document expiry details, redemption steps, and reward notes.</li>
          <li>Flag uncertain reports for follow-up before they reach the active list.</li>
        </ul>
      </section>

      <section>
        <h2>Meet the Team</h2>
        <p>
          Our editors and contributors are long-time Roblox fans who specialize in specific genres—from simulators to RPGs
          and competitive experiences. Each writer maintains a portfolio on the <Link href="/authors">author index</Link>
          {" "}
          so you can see their latest coverage.
        </p>
      </section>

      <section>
        <h2>Supporting the Community</h2>
        <p>
          Questions, corrections, or partnership ideas are always welcome. Reach out via our <Link href="/contact">contact
          page</Link> and we will respond within one business day.
        </p>
      </section>
    </article>
  );
}
