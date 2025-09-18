import { getGameBySlug, listCodesForGame, listGamesWithActiveCounts } from "@/lib/db";
import { notFound } from "next/navigation";
import { monthYear } from "@/lib/date";
import { marked } from "marked";
import { AuthorCard } from "@/components/AuthorCard";
import { CopyCodeButton } from "@/components/CopyCodeButton";
import { ExpiredCodes } from "@/components/ExpiredCodes";
import { GameCard } from "@/components/GameCard";

export const revalidate = 0;

type Params = { params: { slug: string } };

function cleanRewardsText(text?: string | null): string | null {
  if (!text) return null;
  let t = text.replace(/\s+/g, " ").trim();
  t = t.replace(/^New Code/i, "").trim();
  t = t.replace(/^Copy/i, "").trim();
  t = t.replace(/\s*(Active|Expired|Check)\s*$/i, "").trim();
  t = t.replace(/this code credits your account with/i, "This code gives you");
  return t || null;
}

export async function generateMetadata({ params }: Params) {
  const game = await getGameBySlug(params.slug);
  if (!game) return {};
  const when = monthYear();
  const title = `${game.name} Codes (${when}) — Active & Working`;
  const description = game.seo_description || `All active ${game.name} codes with rewards and how to redeem.`;
  const url = `${process.env.SITE_URL}/${game.slug}`;
  const authors = game.author ? [{ name: game.author.name, url: game.author.website || undefined }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: url },
    authors,
    openGraph: {
      title, description, url, images: [{ url: game.cover_image || "/og-image.png" }]
    },
    twitter: {
      title, description, images: [game.cover_image || "/og-image.png"]
    }
  };
}

export default async function GamePage({ params }: Params) {
  const game = await getGameBySlug(params.slug);
  if (!game || !game.is_published) return notFound();
  const codes = await listCodesForGame(game.id);
  const allGames = await listGamesWithActiveCounts();
  const author = game.author;

  const active = codes.filter(c => c.status === "active");
  const needsCheck = codes.filter(c => c.status === "check");
  const expired = codes.filter(c => c.status === "expired");
  const lastUpdated = codes.reduce((acc, c) => acc > c.last_seen_at ? acc : c.last_seen_at, "1970-01-01T00:00:00Z");
  const recommended = allGames
    .filter((g) => g.id !== game.id)
    .sort((a, b) => {
      if (b.active_count !== a.active_count) return b.active_count - a.active_count;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 6);

  const lastUpdatedFormatted = new Date(lastUpdated).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const [introHtml, redeemHtml, descriptionHtml, authorBioHtml] = await Promise.all([
    game.intro_md ? marked.parse(game.intro_md) : "",
    game.redeem_md ? marked.parse(game.redeem_md) : "",
    game.description_md ? marked.parse(game.description_md) : "",
    author?.bio_md ? marked.parse(author.bio_md) : "",
  ]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.25fr)]">
      <article>
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">{game.name} Codes ({monthYear()})</h1>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent">
            <time dateTime={lastUpdated}>
              Last check and updated {game.name} codes on {lastUpdatedFormatted}
            </time>
          </div>
        </header>

        {introHtml ? (
          <section className="mb-8" id="intro">
            <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: introHtml }} />
          </section>
        ) : null}

        <section className="panel mb-8 space-y-3 px-5 pb-5 pt-3" id="active-codes">
          <div className="prose prose-headings:mt-0 prose-headings:mb-2 prose-p:mt-2 dark:prose-invert max-w-none">
            <h2>Active {game.name} Codes</h2>
            <p className="text-muted">
              Right now, there are {active.length} active {active.length === 1 ? "code" : "codes"} you can use in {game.name}. Remember, these codes are case-sensitive, so copy/paste or enter them exactly as shown.
            </p>
          </div>
          {active.length === 0 ? (
            <p className="text-muted">
              We haven't confirmed any working codes right now{needsCheck.length ? ", but try the unverified ones below." : ". Check back soon."}
            </p>
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-sm)] border border-border/50">
              <table className="w-full border-collapse text-sm text-foreground">
                <thead className="bg-surface-muted/60 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Reward</th>
                  </tr>
                </thead>
                <tbody>
                  {[...active].reverse().map(c => {
                    const rewards = cleanRewardsText(c.rewards_text);
                    return (
                      <tr key={c.id} className="border-t border-border/40 hover:bg-surface-muted/50">
                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-wrap items-center gap-3">
                            <code
                              id={c.code}
                              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-accent to-accent-dark px-4 py-2 text-sm font-semibold tracking-wide text-white shadow-soft"
                            >
                              {c.code}
                            </code>
                            <CopyCodeButton code={c.code} tone="accent" />
                            {c.is_new ? <span className="chip bg-accent/15 text-accent">New</span> : null}
                          </div>
                          {c.level_requirement != null ? (
                            <p className="text-xs text-muted mt-2">Level required: {c.level_requirement}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 align-top">
                          {rewards ? <p className="text-sm text-foreground/90">{rewards}</p> : <p className="text-sm text-muted">No reward listed</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel mb-8 space-y-3 px-5 pb-5 pt-3" id="needs-check">
          <div className="prose prose-headings:mt-0 prose-headings:mb-2 prose-p:mt-2 dark:prose-invert max-w-none">
            <h2>Codes To Double-Check</h2>
            {needsCheck.length === 0 ? (
              <p className="text-muted">We haven't seen any uncertain codes reported today.</p>
            ) : null}
          </div>
          {needsCheck.length === 0 ? null : (
            <div className="overflow-hidden rounded-[var(--radius-sm)] border border-border/60">
              <table className="w-full border-collapse text-sm text-foreground">
                <thead className="bg-surface-muted/60 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Reward</th>
                  </tr>
                </thead>
                <tbody>
                  {[...needsCheck].reverse().map(c => {
                    const rewards = cleanRewardsText(c.rewards_text);
                    return (
                      <tr key={c.id} className="border-t border-border/40 hover:bg-surface-muted/50">
                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-wrap items-center gap-3">
                            <code className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-semibold tracking-wide text-foreground">{c.code}</code>
                            <CopyCodeButton code={c.code} />
                          </div>
                          {c.level_requirement != null ? (
                            <p className="text-xs text-muted mt-2">Level required: {c.level_requirement}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 align-top">
                          {rewards ? <p className="text-sm text-foreground/90">{rewards}</p> : <p className="text-sm text-muted">No reward listed</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel mb-8 space-y-3 px-5 pb-5 pt-3" id="expired-codes">
          <div className="prose prose-headings:mt-0 prose-headings:mb-2 prose-p:mt-2 dark:prose-invert max-w-none">
            <h2>Expired {game.name} Codes</h2>
            {expired.length === 0 ? (
              <p className="text-muted">We haven't tracked any expired codes yet.</p>
            ) : null}
          </div>
          {expired.length === 0 ? null : <ExpiredCodes codes={expired} />}
        </section>

        {redeemHtml ? (
          <section className="mb-8" id="redeem">
            <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: redeemHtml }} />
          </section>
        ) : null}

        <section className="mb-10" id="description">
          {descriptionHtml ? (
            <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
          ) : (
            <p className="text-muted">This section will explain the game and how to redeem codes.</p>
          )}
        </section>

        {author ? <AuthorCard author={author} bioHtml={authorBioHtml} /> : null}

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [{
              "@type": "Question",
              "name": "How do I redeem codes in Roblox?",
              "acceptedAnswer": { "@type": "Answer", "text": "Open the game, look for the codes/redeem menu, paste a working code, and confirm." }
            }]
          }) }}
        />
      </article>

      {recommended.length > 0 ? (
        <aside className="space-y-4">
          <div className="panel space-y-2 p-5">
            <h2 className="text-lg font-semibold text-foreground">More games with codes</h2>
            <p className="text-sm text-muted">Discover other Roblox games that currently have active rewards.</p>
          </div>
          <div className="grid gap-4">
            {recommended.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
