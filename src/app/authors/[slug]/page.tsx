import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { GameCard } from "@/components/GameCard";
import { authorAvatarUrl } from "@/lib/avatar";
import {
  getAuthorBySlug,
  listPublishedGamesByAuthorWithActiveCounts
} from "@/lib/db";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  authorJsonLd,
  breadcrumbJsonLd
} from "@/lib/seo";

export const revalidate = 0;

type Params = { params: { slug: string } };

function authorLinks(author: {
  twitter?: string | null;
  youtube?: string | null;
  website?: string | null;
}) {
  const links: { label: string; href: string }[] = [];
  if (author.twitter) {
    const handle = author.twitter.startsWith("http") ? author.twitter : `https://twitter.com/${author.twitter.replace(/^@/, "")}`;
    links.push({ label: "Twitter", href: handle });
  }
  if (author.youtube) {
    links.push({ label: "YouTube", href: author.youtube });
  }
  if (author.website) {
    links.push({ label: "Website", href: author.website });
  }
  return links;
}

function markdownToPlain(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/\[(.+?)\]\((.*?)\)/g, "$1")
    .replace(/[*_`>#~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const author = await getAuthorBySlug(params.slug);
  if (!author) {
    return {};
  }

  const title = `${author.name} · ${SITE_NAME}`;
  const description = markdownToPlain(author.bio_md) || SITE_DESCRIPTION;
  const canonical = `${SITE_URL}/authors/${author.slug}`;
  const avatar = authorAvatarUrl(author, 256);

  return {
    title,
    description,
    alternates: { canonical },
    authors: [{ name: author.name, url: canonical }],
    openGraph: {
      type: "profile",
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      images: [avatar || `${SITE_URL}/og-image.png`]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [avatar || `${SITE_URL}/og-image.png`]
    }
  };
}

export default async function AuthorPage({ params }: Params) {
  const author = await getAuthorBySlug(params.slug);
  if (!author) {
    return notFound();
  }

  const games = await listPublishedGamesByAuthorWithActiveCounts(author.id);
  const avatar = authorAvatarUrl(author, 120);
  const bioHtml = author.bio_md ? await marked.parse(author.bio_md) : "";
  const bioText = markdownToPlain(author.bio_md) || `${author.name} shares the latest Roblox code guides on ${SITE_NAME}.`;
  const canonical = `${SITE_URL}/authors/${author.slug}`;
  const breadcrumbData = JSON.stringify(
    breadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Authors", url: `${SITE_URL}/authors` },
      { name: author.name, url: canonical }
    ])
  );
  const authorData = JSON.stringify(
    authorJsonLd({
      siteUrl: SITE_URL,
      author,
      avatar,
      description: bioText
    })
  );

  const links = authorLinks(author);

  return (
    <div className="space-y-12">
      <header className="rounded-[var(--radius-lg)] border border-border/60 bg-surface px-6 py-8 shadow-soft">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-8">
          <img
            src={avatar || "https://www.gravatar.com/avatar/?d=mp"}
            alt={author.name}
            className="h-24 w-24 flex-shrink-0 rounded-full border border-border/50 object-cover shadow-soft"
            loading="lazy"
          />
          <div className="space-y-4">
            <div>
              <h1 className="text-4xl font-bold text-foreground">{author.name}</h1>
              {author.slug ? (
                <p className="text-sm text-muted">@{author.slug}</p>
              ) : null}
            </div>
            {bioHtml ? (
              <div
                className="prose dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: bioHtml }}
              />
            ) : (
              <p className="text-sm text-muted">{bioText}</p>
            )}
            {links.length ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-border/50 px-4 py-2 transition hover:border-accent hover:text-accent"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Guides & Updates</h2>
          <p className="text-sm text-muted">
            Active Roblox code collections published by {author.name}.
          </p>
        </div>
        {games.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {games.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            {author.name} hasn't published any guides yet. Check back soon!
          </p>
        )}
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbData }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: authorData }} />
    </div>
  );
}
