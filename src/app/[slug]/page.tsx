import { getGameBySlug, listCodesForGame, listGamesWithActiveCounts } from "@/lib/db";
import { notFound } from "next/navigation";
import { monthYear } from "@/lib/date";
import { marked } from "marked";
import { CopyCodeButton } from "@/components/CopyCodeButton";
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
  return {
    title,
    description,
    alternates: { canonical: url },
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

  const html = game.description_md ? await marked.parse(game.description_md) : "";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.25fr)]">
      <article>
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">{game.name} Codes ({monthYear()})</h1>
          <p className="text-muted">Active, expired, and how to redeem.</p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent">
            <span>Updated</span>
            <time dateTime={lastUpdated}>{new Date(lastUpdated).toLocaleDateString()}</time>
          </div>
        </header>

        <section className="panel mb-8 space-y-4 p-6" id="active-codes">
          <h2 className="text-xl font-semibold mb-3 text-foreground">Active {game.name} Codes</h2>
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

        <section className="panel mb-8 space-y-4 p-6" id="needs-check">
          <h2 className="text-xl font-semibold mb-3 text-foreground">Codes To Double-Check</h2>
          {needsCheck.length === 0 ? (
            <p className="text-muted">We haven't seen any uncertain codes reported today.</p>
          ) : (
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

        <section className="panel mb-8 space-y-3 p-6" id="expired-codes">
          <h2 className="text-xl font-semibold mb-3 text-foreground">Expired {game.name} Codes</h2>
          {expired.length === 0 ? (
            <p className="text-muted">We haven't tracked any expired codes yet.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-2 text-xs text-foreground/80 sm:grid-cols-3 md:grid-cols-4">
              {[...expired].reverse().map(c => (
                <li key={c.id} className="rounded-full border border-border/40 bg-surface-muted/70 px-3 py-1 text-center font-medium text-muted">
                  <code>{c.code}</code>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-10" id="description">
          {html ? (
            <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="text-muted">This section will explain the game and how to redeem codes.</p>
          )}
        </section>

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
