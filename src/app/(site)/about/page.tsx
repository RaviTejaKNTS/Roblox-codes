import type { Metadata } from "next";
import "@/styles/article-content.css";
import { SITE_NAME, SITE_URL, buildAlternates } from "@/lib/seo";

const title = "About Bloxodes.com";
const description =
  "Learn how Bloxodes.com grew from a Robux calculator into a Roblox hub for tools, checklists, live lists, codes, guides, and optional accounts.";
const canonical = `${SITE_URL.replace(/\/$/, "")}/about`;
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

export default function AboutPage() {
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "AboutPage",
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
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">About Bloxodes.com</h1>
          <p className="text-base text-muted sm:text-lg">
            Today, Bloxodes is a growing Roblox hub with tools, checklists, live lists, codes, reference pages, and optional accounts to help
            players stay informed and connected.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">How Bloxodes Started</h2>
          <p>
            Bloxodes began because I just wanted to buy a purple hat that costed 788 Robux. I just wanted to know how much it would cost me
            in real money. However, most online Robux calculators are just doing a fixed Robux to USD calculation. But Robux offers various
            packages and price to Robux ratio changes based on the package you choose. So instead of making the calculation on paper, I took
            this like side project and build the tool that actually considers Robux to USD conversion based on the packages.
          </p>
          <p>
            When it worked, I figured others might find it useful too, so I put it online.
          </p>
          <p>
            Slowly, we added more and more to the platform. I partnered with my friends who play Roblox and we dabbed into providing Roblox
            Codes and wanted to make the site a codes hub. Now it is slowly turning into a full Roblox platform with guides, checklists, live
            lists, and many other tools.
          </p>
          <p>What started as a tiny calculator has turned into a platform.</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">What Bloxodes Is Today</h2>
          <p>Bloxodes is a Roblox Hub that is growing, expanding and keeps on updating as games get updated and info gets changed.</p>
          <p>Here is what you will find here:</p>
          <ul className="list-disc pl-6">
            <li>
              <strong>
                <a href="/tools">Tools &amp; calculators</a>
              </strong>
              : We build calculators and helpers that save time, especially in games with crafting, RNG, upgrades, trading, and economies.
              When a tool gives you a result, we aim to show a clear breakdown so you understand where the number came from (not a "black
              box" result). We also openly share the data we use for our calculators and formulas we use for calculations.
            </li>
            <li>
              <strong>
                <a href="/checklists">Interactive checklists</a>
              </strong>
              : Some Roblox games get chaotic fast. Checklists turn that chaos into a path. Our checklists help you track progress across
              quests, items, upgrades, regions, and milestones, so you always know what you have done and what is next. Currently, we are
              storing these directly on your browser.
            </li>
            <li>
              <strong>Accounts &amp; profiles</strong>: Optional sign-in lets you comment, manage preferences, and link a Roblox account to
              unlock Roblox-specific features and personalization.
            </li>
            <li>
              <strong>
                <a href="/lists">Live lists &amp; rankings</a>
              </strong>
              : Roblox trends move fast. A game that is huge today can disappear tomorrow. Our live lists are built to show what players are
              actually playing right now, using real Roblox data (not votes or opinions). They are meant for discovery: "What should I play
              next?" and "What is blowing up today?".
            </li>
            <li>
              <strong>
                <a href="/codes">Roblox Game Codes</a>
              </strong>
              : We also cover Roblox game codes because who would not love some freebies in games directly from the developers. We have a
              system to check the developer social handles and then we manually verify and update the codes regularly. We remove the expired
              ones that do not work anymore.
            </li>
            <li>
              <strong>Catalog pages (free items, IDs, and more)</strong>: We are expanding Bloxodes into a proper Roblox reference hub,
              including catalog-style pages such as: free items and limited-time rewards, music IDs / audio IDs, decals, animations, and other
              ID libraries. We also list specific game related items and everything.
            </li>
          </ul>
          <p>
            The goal is simple: make Bloxodes the place you check when you need something specific related to Bloxodes either that is for
            latest active codes, tools that help you calculate and plan, checklists that keeps track of your gameplay progress from start to
            end, lists you can use to find and discover new games and even experience based guides across the Roblox games.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Who We Are</h2>
          <p>
            We are a small team of six people working on Bloxodes. Some of us write, some of us code, and all of us play Roblox. Together, we
            build tools, maintain guides, update codes, and keep the platform growing.
          </p>
          <p>
            You can meet our full team on our <a href="/authors">Authors Page</a>, where each member has their own profile and list of guides
            they cover.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">How We Keep Things Accurate and Updated</h2>
          <p>We know Roblox related info can get outdated quickly, like the codes expire, mechanics change, and trends shift overnight.</p>
          <p>So we built Bloxodes around freshness and clarity.</p>
          <p>Here is how we work:</p>
          <ul className="list-disc pl-6">
            <li>We track official sources (like developer announcements on Discord, X/Twitter, and in-game updates) for codes and major changes.</li>
            <li>We keep "last checked / last updated" timestamps visible so you can tell how recent something is.</li>
            <li>We separate active vs expired info so you do not waste time.</li>
            <li>For tools, we try to explain assumptions and show the formula or logic in normal language.</li>
            <li>Reader feedback matters. If you spot something wrong, we want to hear it.</li>
          </ul>
          <p>
            If you find an incorrect code, wrong value, or missing entry, you can reach out via our <a href="/contact">Contact page</a> or
            email us at <a href="mailto:getbloxodes@gmail.com">getbloxodes@gmail.com</a>.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">What We Will Never Do</h2>
          <p>This matters, because the Roblox space has a lot of scammy sites.</p>
          <p>Bloxodes is built to be safe and straightforward:</p>
          <ul className="list-disc pl-6">
            <li>We do not sell codes.</li>
            <li>We do not ask for your Roblox password.</li>
            <li>We do not promise "free Robux" or fake rewards.</li>
            <li>We do not claim to be affiliated with Roblox or any game developer.</li>
          </ul>
          <p>
            Bloxodes is fan-made and independent. Roblox is owned by Roblox Corporation, and we are not connected to them.
          </p>
        </section>

        <section className="space-y-4">
          <p>
            Thanks for being here, and thanks for helping us build this into something genuinely useful.
          </p>
        </section>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      </article>

      <aside aria-hidden className="hidden lg:block" />
    </div>
  );
}
