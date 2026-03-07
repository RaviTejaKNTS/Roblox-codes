import type { Metadata } from "next";
import { formatDistanceToNow } from "date-fns";
import { CatalogCard } from "@/components/CatalogCard";
import { CATALOG_DESCRIPTION, SITE_NAME, SITE_URL, buildAlternates } from "@/lib/seo";
import { supabaseAdmin } from "@/lib/supabase";
import { loadAdminCommandSummary } from "@/lib/admin-commands";

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

type CatalogStats = {
  count: number | null;
  updatedAt: string | null;
};

type CatalogEntry = {
  id: string;
  href: string;
  title: string;
  description: string;
  category: string;
  metricLabel: string;
  tileLabel?: string | null;
  coverImage?: string | null;
  tone?: "indigo" | "emerald" | "amber";
  loadStats: () => Promise<CatalogStats>;
};

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

async function loadMusicIdsStats(): Promise<CatalogStats> {
  try {
    const sb = supabaseAdmin();
    const { data, error, count } = await sb
      .from("roblox_music_ids")
      .select("asset_id, last_seen_at", { count: "exact" })
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .range(0, 0);

    if (error) {
      console.error("Failed to load Roblox music IDs stats", error);
      return { count: 0, updatedAt: null };
    }

    const updatedAt = data?.[0]?.last_seen_at ?? null;
    return {
      count: count ?? data?.length ?? 0,
      updatedAt
    };
  } catch (error) {
    console.error("Failed to load Roblox music IDs stats", error);
    return { count: 0, updatedAt: null };
  }
}

async function loadAdminCommandsStats(): Promise<CatalogStats> {
  try {
    const summary = await loadAdminCommandSummary();
    return {
      count: summary.totalCommands,
      updatedAt: summary.latestUpdatedOn
    };
  } catch (error) {
    console.error("Failed to load admin commands stats", error);
    return { count: 0, updatedAt: null };
  }
}

async function loadColorCodesStats(): Promise<CatalogStats> {
  try {
    const { loadRobloxColorCodesPageData } = await import("./roblox-color-codes/page-data");
    const data = await loadRobloxColorCodesPageData();
    return {
      count: data.items.length,
      updatedAt: data.meta.updatedAt ?? null
    };
  } catch (error) {
    console.error("Failed to load Roblox color codes stats", error);
    return { count: 0, updatedAt: null };
  }
}

const CATALOG_ENTRIES: CatalogEntry[] = [
  {
    id: "music-ids",
    href: "/catalog/roblox-music-ids",
    title: "Roblox music IDs",
    description: "Search Roblox music IDs with album art, artists, genres, and direct play links.",
    category: "Audio",
    metricLabel: "music IDs",
    tileLabel: "IDs",
    tone: "indigo",
    loadStats: loadMusicIdsStats
  },
  {
    id: "color-codes",
    href: "/catalog/roblox-color-codes",
    title: "Roblox color codes",
    description: "Browse every official Roblox BrickColor with copyable names, numbers, RGB values, and hex codes.",
    category: "Design",
    metricLabel: "color codes",
    tileLabel: "Color",
    tone: "amber",
    loadStats: loadColorCodesStats
  },
  {
    id: "admin-commands",
    href: "/catalog/admin-commands",
    title: "Roblox admin commands",
    description: "Compare popular admin systems and browse full Roblox command lists.",
    category: "Moderation",
    metricLabel: "command entries",
    tileLabel: "Admin",
    tone: "emerald",
    loadStats: loadAdminCommandsStats
  }
];

async function buildCatalogCards() {
  const results = await Promise.all(
    CATALOG_ENTRIES.map(async (entry) => {
      const { loadStats, ...cardBase } = entry;
      const stats = await loadStats();
      return {
        ...cardBase,
        metricValue: stats.count ?? 0,
        updatedLabel: formatUpdatedLabel(stats.updatedAt),
        updatedAt: stats.updatedAt
      };
    })
  );

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
