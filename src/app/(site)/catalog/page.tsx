import type { Metadata } from "next";
import { formatDistanceToNow } from "date-fns";
import { CatalogCard } from "@/components/CatalogCard";
import { CATALOG_DESCRIPTION, SITE_NAME, SITE_URL, buildAlternates } from "@/lib/seo";
import { listPublishedTopLevelCatalogPages } from "@/lib/catalog";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Roblox Catalogs | ${SITE_NAME}`,
  description: CATALOG_DESCRIPTION,
  alternates: buildAlternates(`${SITE_URL}/catalog`),
  openGraph: {
    type: "website",
    url: `${SITE_URL}/catalog`,
    title: `Roblox Catalogs | ${SITE_NAME}`,
    description: CATALOG_DESCRIPTION,
    siteName: SITE_NAME
  },
  twitter: {
    card: "summary_large_image",
    title: `Roblox Catalogs | ${SITE_NAME}`,
    description: CATALOG_DESCRIPTION
  }
};

const CATALOG_CARD_TONES = ["indigo", "amber", "emerald"] as const;

function parseDate(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function latestTimestamp(values: Array<number | null>): number | null {
  let latest: number | null = null;
  for (const value of values) {
    if (typeof value !== "number") continue;
    if (latest === null || value > latest) {
      latest = value;
    }
  }
  return latest;
}

function formatUpdatedLabel(value: string | null) {
  if (!value) return null;
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return null;
  }
}

function summarizeCatalogDescription(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Open this Roblox catalog hub for the latest published content.";
}

async function buildCatalogCards() {
  const pages = await listPublishedTopLevelCatalogPages();
  const results = pages.map((entry, index) => {
    const updatedAt = entry.content_updated_at ?? entry.updated_at ?? entry.published_at ?? entry.created_at ?? null;
    return {
      id: entry.code,
      href: `/catalog/${entry.code}`,
      title: entry.title,
      description: summarizeCatalogDescription(entry.meta_description),
      category: "Catalog",
      metricLabel: null,
      metricValue: null,
      tileLabel: entry.title,
      coverImage: entry.thumb_url ?? null,
      tone: CATALOG_CARD_TONES[index % CATALOG_CARD_TONES.length],
      updatedLabel: formatUpdatedLabel(updatedAt),
      updatedAt
    };
  });

  const latestUpdated = latestTimestamp(results.map((entry) => parseDate(entry.updatedAt)));
  return {
    cards: results,
    total: results.length,
    refreshedLabel:
      typeof latestUpdated === "number" ? formatDistanceToNow(new Date(latestUpdated), { addSuffix: true }) : null
  };
}

export default async function CatalogIndexPage() {
  const { cards, total, refreshedLabel } = await buildCatalogCards();

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent/80">Catalog</p>
        <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-5xl">
          Roblox catalogs organized by item type
        </h1>
        <p className="max-w-2xl text-base text-muted md:text-lg">
          Browse Roblox catalog pages for free items, music IDs, admin commands, promo codes, decal IDs, and more.
        </p>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted md:text-sm">
          <span className="rounded-full bg-accent/10 px-4 py-1 font-semibold uppercase tracking-wide text-accent">
            {total} catalog hub{total === 1 ? "" : "s"}
          </span>
          {refreshedLabel ? (
            <span className="rounded-full bg-surface-muted px-4 py-1 font-semibold text-muted">
              Updated {refreshedLabel}
            </span>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ id, updatedAt: _updatedAt, ...card }, index) => (
          <div
            key={id}
            className="contents"
            data-analytics-event="select_item"
            data-analytics-item-list-name="catalog_index"
            data-analytics-item-id={id}
            data-analytics-item-name={card.title}
            data-analytics-position={index + 1}
            data-analytics-content-type="catalog"
          >
            <CatalogCard {...card} />
          </div>
        ))}
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Roblox Catalogs",
            description: CATALOG_DESCRIPTION,
            url: `${SITE_URL}/catalog`
          })
        }}
      />
    </div>
  );
}
