import type { Metadata } from "next";
import Link from "next/link";
import { authorAvatarUrl } from "@/lib/avatar";
import { listAuthors } from "@/lib/db";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Bloxodes Authors";
const description = "Meet the editors and contributors who verify Roblox codes for Bloxodes.";
const baseUrl = SITE_URL.replace(/\/$/, "");
const canonical = `${baseUrl}/authors`;
const ogImage = `${SITE_URL}/og-image.png`;

export const metadata: Metadata = {
  title: `${title} | ${SITE_NAME}`,
  description,
  alternates: { canonical },
  openGraph: {
    type: "website",
    url: canonical,
    title: `${title} | ${SITE_NAME}`,
    description,
    siteName: SITE_NAME,
    images: [ogImage]
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} | ${SITE_NAME}`,
    description,
    images: [ogImage]
  }
};

export const revalidate = 300;

export default async function AuthorsIndexPage() {
  const authors = await listAuthors();
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: canonical,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL
    },
    itemListElement: authors
      .filter((author) => author.slug)
      .map((author, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${baseUrl}/authors/${author.slug}`,
        name: author.name
      }))
  });

  return (
    <section className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-4xl font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted md:text-base">{description}</p>
      </header>

      {authors.length === 0 ? (
        <p className="text-sm text-muted">No authors found yet. Check back soon.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {authors.map((author) => {
            const avatar = authorAvatarUrl(author, 96);
            const plainBio = author.bio_md
              ? author.bio_md
                  .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
                  .replace(/[*_`>#~|-]/g, " ")
                  .replace(/\s+/g, " ")
                  .trim()
              : "";
            const preview = plainBio.length > 180 ? `${plainBio.slice(0, 177)}…` : plainBio;
            return (
              <article
                key={author.id}
                className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-border/50 bg-surface px-5 py-6 shadow-soft transition hover:-translate-y-[2px] hover:border-accent/50 hover:shadow-lg"
              >
                <div className="flex items-start gap-4">
                  <img
                    src={avatar || "https://www.gravatar.com/avatar/?d=mp"}
                    alt={author.name}
                    className="h-16 w-16 flex-shrink-0 rounded-full border border-border/40 object-cover"
                    loading="lazy"
                  />
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-foreground">
                      {author.slug ? (
                        <Link href={`/authors/${author.slug}`} className="transition hover:text-accent">
                          {author.name}
                        </Link>
                      ) : (
                        author.name
                      )}
                    </h2>
                    {author.slug ? (
                      <p className="text-xs uppercase tracking-[0.18em] text-muted">@{author.slug}</p>
                    ) : null}
                  </div>
                </div>
                {preview ? (
                  <p className="text-sm leading-relaxed text-muted">{preview}</p>
                ) : (
                  <p className="text-sm text-muted">
                    {author.name} helps keep Roblox code guides accurate and up to date.
                  </p>
                )}
                <div className="mt-auto">
                  {author.slug ? (
                    <Link
                      href={`/authors/${author.slug}`}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-accent transition hover:text-accent-dark"
                    >
                      View profile
                      <span aria-hidden>→</span>
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
    </section>
  );
}
