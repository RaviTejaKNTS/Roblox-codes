import fs from "node:fs/promises";
import path from "node:path";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import type { ReactNode } from "react";
import { CatalogAdSlot } from "@/components/CatalogAdSlot";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { breadcrumbJsonLd, SITE_URL, webPageJsonLd } from "@/lib/seo";
import { ForgeCatalogView } from "./ForgeCatalogView";
import { processHtmlLinks } from "@/lib/link-utils";
import { renderHtmlAsReactNodes } from "@/lib/html-to-react";

const FALLBACK_IMAGE = "/og-image.png";

export const BASE_PATH = "/catalog/the-forge";

export type CatalogContentHtml = {
  id?: string | null;
  title?: string | null;
  introHtml?: string;
  howHtml?: string;
  descriptionHtml?: Array<{ key: string; html: string }>;
  faqHtml?: Array<{ q: string; a: string }>;
  updatedAt?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
};

function renderCatalogNodes(html: string, keyPrefix: string): ReactNode[] {
  return renderHtmlAsReactNodes(processHtmlLinks(html).__html, { keyPrefix });
}

export type ForgeCatalogConfig = {
  slug: string;
  label: string;
  file: string;
  navDescription: string;
  description: string;
  groupKey: string;
  groupLabel: string;
  stats: Array<{ key: string; label: string }>;
  badgeKey?: string;
  subtitleKeys?: string[];
  descriptionKey?: string;
  linkKey?: string;
  maxStats?: number;
};

export const FORGE_CATALOGS: ForgeCatalogConfig[] = [
  {
    slug: "ores",
    label: "Ores",
    file: "ores.json",
    navDescription: "Regions, rarities, drop chances, and multipliers.",
    description: "Browse every ore in The Forge with drop chances, multipliers, and regions.",
    groupKey: "region",
    groupLabel: "Region",
    badgeKey: "rarity",
    descriptionKey: "description",
    stats: [
      { key: "dropChance", label: "Drop" },
      { key: "multiplier", label: "Multiplier" },
      { key: "sellPrice", label: "Sell" },
      { key: "rocks", label: "Rock" },
      { key: "trait", label: "Trait" }
    ],
    maxStats: 4
  },
  {
    slug: "weapons",
    label: "Weapons",
    file: "weapons.json",
    navDescription: "Weapon classes with damage, speed, and range.",
    description: "Compare every forgeable weapon in The Forge grouped by class.",
    groupKey: "class",
    groupLabel: "Weapon class",
    stats: [
      { key: "baseDamage", label: "Damage" },
      { key: "attackSpeed", label: "Speed" },
      { key: "range", label: "Range" },
      { key: "sellPrice", label: "Sell" },
      { key: "chance", label: "Forge" }
    ],
    maxStats: 4
  },
  {
    slug: "armors",
    label: "Armors",
    file: "armors.json",
    navDescription: "Armor classes and slots with health values.",
    description: "See every armor piece in The Forge, grouped by armor class.",
    groupKey: "class",
    groupLabel: "Armor class",
    badgeKey: "slot",
    stats: [
      { key: "baseHealth", label: "Base health" },
      { key: "sellPrice", label: "Sell" },
      { key: "chance", label: "Forge" }
    ],
    maxStats: 3
  },
  {
    slug: "pickaxes",
    label: "Pickaxes",
    file: "pickaxes.json",
    navDescription: "Power, speed, luck, and where to find them.",
    description: "Explore every pickaxe in The Forge with power, speed, and luck stats.",
    groupKey: "category",
    groupLabel: "Region",
    subtitleKeys: ["location"],
    stats: [
      { key: "power", label: "Power" },
      { key: "speed", label: "Speed" },
      { key: "luck", label: "Luck" },
      { key: "slots", label: "Slots" },
      { key: "cost", label: "Cost" }
    ],
    linkKey: "link",
    maxStats: 4
  },
  {
    slug: "runes",
    label: "Runes",
    file: "runes.json",
    navDescription: "Elements, rarities, and effects.",
    description: "All The Forge runes with elements, rarities, and effects.",
    groupKey: "element",
    groupLabel: "Element",
    badgeKey: "rarity",
    descriptionKey: "effect",
    stats: [{ key: "primaryDrop", label: "Primary drop" }],
    linkKey: "link",
    maxStats: 2
  },
  {
    slug: "races",
    label: "Races",
    file: "races.json",
    navDescription: "Race tiers, rarities, and stat bonuses.",
    description: "Every The Forge race with tiers, roll chances, and stat bonuses.",
    groupKey: "tier",
    groupLabel: "Tier",
    badgeKey: "rarity",
    stats: [
      { key: "rollChance", label: "Roll" },
      { key: "damage", label: "Damage" },
      { key: "health", label: "Health" },
      { key: "speed", label: "Speed" }
    ],
    linkKey: "link",
    maxStats: 4
  },
  {
    slug: "essences",
    label: "Essences",
    file: "essences.json",
    navDescription: "Essence tiers with quick descriptions.",
    description: "All The Forge essences organized by tier.",
    groupKey: "tier",
    groupLabel: "Tier",
    descriptionKey: "description",
    stats: [],
    linkKey: "link",
    maxStats: 2
  },
  {
    slug: "totems",
    label: "Totems",
    file: "totems.json",
    navDescription: "Totem costs and effects.",
    description: "Every The Forge totem with cost and effect details.",
    groupKey: "section",
    groupLabel: "Section",
    descriptionKey: "effect",
    stats: [{ key: "cost", label: "Cost" }],
    linkKey: "link",
    maxStats: 2
  },
  {
    slug: "potions",
    label: "Potions",
    file: "potions.json",
    navDescription: "Potion costs and effects.",
    description: "Every The Forge potion with cost and effect details.",
    groupKey: "section",
    groupLabel: "Section",
    descriptionKey: "effect",
    stats: [{ key: "cost", label: "Cost" }],
    linkKey: "link",
    maxStats: 2
  },
  {
    slug: "enemies",
    label: "Enemies",
    file: "enemies.json",
    navDescription: "Enemy stats and rewards by area.",
    description: "The Forge enemy list with stats, gold, and experience rewards.",
    groupKey: "area",
    groupLabel: "Area",
    badgeKey: "level",
    subtitleKeys: ["group"],
    stats: [
      { key: "health", label: "Health" },
      { key: "damage", label: "Damage" },
      { key: "gold", label: "Gold" },
      { key: "experience", label: "XP" }
    ],
    linkKey: "link",
    maxStats: 4
  },
  {
    slug: "npcs",
    label: "NPCs",
    file: "npcs.json",
    navDescription: "NPC roles and locations.",
    description: "The Forge NPC roster and their roles.",
    groupKey: "area",
    groupLabel: "Area",
    stats: [],
    maxStats: 0
  },
  {
    slug: "locations",
    label: "Locations",
    file: "locations.json",
    navDescription: "Important locations grouped by area.",
    description: "The Forge locations organized by area and type.",
    groupKey: "area",
    groupLabel: "Area",
    badgeKey: "type",
    descriptionKey: "description",
    stats: [],
    linkKey: "link",
    maxStats: 2
  }
];

export function getForgeCatalogConfig(slug: string): ForgeCatalogConfig | null {
  const normalized = slug.trim().toLowerCase();
  return FORGE_CATALOGS.find((entry) => entry.slug === normalized) ?? null;
}

export function buildForgeCatalogCodeCandidates(config: ForgeCatalogConfig): string[] {
  const primary = `the-forge/${config.slug}`;
  return [primary];
}

type ForgeDatasetSource = {
  label?: string | null;
  url?: string | null;
  accessed?: string | null;
};

type ForgeDatasetMeta = {
  title?: string | null;
  updatedAt?: string | null;
  sources?: ForgeDatasetSource[] | null;
  columns?: string[] | null;
};

export type ForgeCatalogItem = {
  id: string;
  name: string;
  image?: string | null;
  link?: string | null;
  [key: string]: string | number | null | undefined;
};

export type ForgeCatalogDataset = {
  meta: ForgeDatasetMeta | null;
  items: ForgeCatalogItem[];
};

async function readForgeDataset(file: string): Promise<{ meta: ForgeDatasetMeta | null; items: ForgeCatalogItem[] }> {
  const datasetPath = path.join(process.cwd(), "data", "The Forge", file);
  const raw = await fs.readFile(datasetPath, "utf8");
  const parsed = JSON.parse(raw) as
    | { meta?: ForgeDatasetMeta | null; items?: Record<string, unknown>[] | null }
    | Record<string, unknown>[];

  if (Array.isArray(parsed)) {
    return { meta: null, items: parsed.map(normalizeItem).filter(Boolean) as ForgeCatalogItem[] };
  }

  const items = (parsed.items ?? []).map(normalizeItem).filter(Boolean) as ForgeCatalogItem[];
  return { meta: parsed.meta ?? null, items };
}

function normalizeItem(row: Record<string, unknown>): ForgeCatalogItem | null {
  const name = normalizeName(row.name);
  if (!name) return null;
  return {
    ...row,
    id: toSlug(name),
    name,
    image: normalizeName(row.image) ?? null,
    link: normalizeName(row.link) ?? null
  };
}

function normalizeName(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return String(value);
}

function normalizeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value.toLocaleString("en-US");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const lowered = trimmed.toLowerCase();
    if (["none", "n/a", "na", "null"].includes(lowered)) return null;
    return trimmed;
  }
  return String(value);
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toSectionId(value: string): string {
  return `section-${toSlug(value || "items")}`;
}

function resolveAbsoluteUrl(value: string | null | undefined): string {
  if (!value) return `${SITE_URL}${FALLBACK_IMAGE}`;
  if (value.startsWith("http")) return value;
  return `${SITE_URL.replace(/\/$/, "")}/${value.replace(/^\//, "")}`;
}


function buildGroupedSections(items: ForgeCatalogItem[], groupKey: string) {
  const groups = new Map<string, ForgeCatalogItem[]>();
  items.forEach((item) => {
    const rawGroup = groupKey ? item[groupKey] : null;
    const label = normalizeValue(rawGroup) ?? "Other";
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)?.push(item);
  });

  return Array.from(groups.entries()).map(([label, entries]) => ({
    id: toSectionId(label),
    label,
    items: entries
  }));
}

function resolveDataUpdatedAt(meta: ForgeDatasetMeta | null): string | null {
  if (!meta) return null;
  if (meta.updatedAt) return meta.updatedAt;
  const sources = meta.sources ?? [];
  return sources.find((source) => source?.accessed)?.accessed ?? null;
}

export async function loadForgeCatalogDataset(config: ForgeCatalogConfig): Promise<ForgeCatalogDataset> {
  try {
    return await readForgeDataset(config.file);
  } catch (error) {
    console.error("Failed to load Forge catalog dataset", error);
    return { meta: null, items: [] };
  }
}

export function ForgeCatalogNav({ activeSlug }: { activeSlug: string }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {FORGE_CATALOGS.map((entry) => {
        const isActive = entry.slug === activeSlug;
        const cardClasses = `group relative overflow-hidden rounded-2xl border px-5 py-4 transition ${
          isActive
            ? "border-accent/70 bg-gradient-to-br from-accent/15 via-surface to-background shadow-soft"
            : "border-border/60 bg-surface/80 hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-soft"
        }`;

        const card = (
          <article className={cardClasses} aria-current={isActive ? "page" : undefined}>
            <span
              aria-hidden
              className={`absolute inset-x-0 top-0 h-1 ${
                isActive ? "bg-accent" : "bg-accent/30 group-hover:bg-accent/60"
              }`}
            />
            <div className="flex h-full flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold text-foreground">{entry.label}</p>
                {isActive ? (
                  <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                    Active
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-muted">{entry.navDescription}</p>
            </div>
          </article>
        );

        if (isActive) {
          return (
            <div key={entry.slug} className="h-full" aria-current="page">
              {card}
            </div>
          );
        }

        return (
          <Link key={entry.slug} href={`${BASE_PATH}/${entry.slug}`} className="block h-full">
            {card}
          </Link>
        );
      })}
    </section>
  );
}

export function ForgeBreadcrumb({ items, className }: { items: Array<{ label: string; href?: string | null }>; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className ?? "text-xs uppercase tracking-[0.25em] text-muted"}>
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-2">
            {item.href ? (
              <Link href={item.href} className="font-semibold text-muted transition hover:text-accent">
                {item.label}
              </Link>
            ) : (
              <span className="font-semibold text-foreground/80">{item.label}</span>
            )}
            {index < items.length - 1 ? <span className="text-muted/60">&gt;</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ForgeSectionNav({ sections }: { sections: Array<{ id: string; label: string; count: number }> }) {
  if (!sections.length) return null;
  return (
    <nav aria-label="Jump to section" className="flex flex-wrap gap-2">
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="rounded-full border border-border/60 bg-surface/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted transition hover:border-accent/70 hover:text-accent"
        >
          {section.label} ({section.count})
        </a>
      ))}
    </nav>
  );
}

export function buildForgeItemListSchema({
  title,
  description,
  url,
  items
}: {
  title: string;
  description: string;
  url: string;
  items: ForgeCatalogItem[];
}) {
  const itemListElement = items.map((item, index) => {
    const image = resolveAbsoluteUrl(item.image ?? FALLBACK_IMAGE);
    const itemUrl = `${url}#item-${item.id}`;
    return {
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Thing",
        name: item.name,
        url: itemUrl,
        image
      }
    };
  });

  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    description,
    url,
    numberOfItems: items.length,
    itemListElement
  });
}

export function renderForgeCatalogPage({
  config,
  dataset,
  contentHtml
}: {
  config: ForgeCatalogConfig;
  dataset: ForgeCatalogDataset;
  contentHtml?: CatalogContentHtml | null;
}) {
  const items = dataset.items;
  const itemCount = items.length;
  const pageTitle = `All ${itemCount.toLocaleString("en-US")} ${config.label} in The Forge`;
  const pageDescription = config.description;
  const introHtml = contentHtml?.introHtml?.trim() ? contentHtml.introHtml : "";
  const descriptionHtml = contentHtml?.descriptionHtml ?? [];
  const howHtml = contentHtml?.howHtml?.trim() ? contentHtml.howHtml : "";
  const faqHtml = contentHtml?.faqHtml ?? [];
  const dataUpdatedAt = resolveDataUpdatedAt(dataset.meta);
  const contentUpdatedAt = contentHtml?.updatedAt ?? null;
  const updatedAt = dataUpdatedAt ?? contentUpdatedAt;
  const updatedDate = updatedAt ? new Date(updatedAt) : null;
  const formattedUpdated = updatedDate
    ? updatedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;
  const updatedRelativeLabel = updatedDate ? formatDistanceToNow(updatedDate, { addSuffix: true }) : null;
  const canonicalPath = `${BASE_PATH}/${config.slug}`;
  const canonicalUrl = `${SITE_URL.replace(/\/$/, "")}${canonicalPath}`;
  const updatedIso = updatedDate ? updatedDate.toISOString() : new Date().toISOString();
  const groupedSections = buildGroupedSections(items, config.groupKey);
  const sectionNav = groupedSections.map((section) => ({
    id: section.id,
    label: section.label,
    count: section.items.length
  }));
  const hasDetails =
    Boolean(descriptionHtml.length) ||
    Boolean(howHtml) ||
    Boolean(faqHtml.length) ||
    Boolean(contentHtml?.ctaLabel && contentHtml?.ctaUrl);

  const breadcrumbNavItems = [
    { label: "Home", href: "/" },
    { label: "Catalog", href: "/catalog" },
    { label: config.label, href: null }
  ];

  const breadcrumbSchema = JSON.stringify(
    breadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Catalog", url: `${SITE_URL.replace(/\/$/, "")}/catalog` },
      { name: config.label, url: canonicalUrl }
    ])
  );

  const listSchema = buildForgeItemListSchema({
    title: pageTitle,
    description: pageDescription,
    url: canonicalUrl,
    items
  });

  const pageSchema = JSON.stringify(
    webPageJsonLd({
      siteUrl: SITE_URL,
      slug: canonicalPath.replace(/^\//, ""),
      title: pageTitle,
      description: pageDescription,
      image: `${SITE_URL}/og-image.png`,
      author: null,
      publishedAt: updatedIso,
      updatedAt: updatedIso
    })
  );
  const introNodes = introHtml ? renderCatalogNodes(introHtml, "forge-intro") : null;
  const descriptionNodes = descriptionHtml.flatMap((entry) =>
    renderCatalogNodes(entry.html, `forge-description-${entry.key}`)
  );
  const howNodes = howHtml ? renderCatalogNodes(howHtml, "forge-how") : null;
  const faqNodes = faqHtml.map((faq, idx) => ({
    ...faq,
    nodes: renderCatalogNodes(faq.a, `forge-faq-${idx}`)
  }));

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <ForgeBreadcrumb items={breadcrumbNavItems} />
        <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-5xl">{pageTitle}</h1>
        <p className="max-w-2xl text-base text-muted md:text-lg">{pageDescription}</p>
        {formattedUpdated ? (
          <p className="text-sm text-foreground/80">
            Updated on <span className="font-semibold text-foreground">{formattedUpdated}</span>
            {updatedRelativeLabel ? <span>{" "}({updatedRelativeLabel})</span> : null}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted md:text-sm">
          <span className="rounded-full bg-accent/10 px-4 py-1 font-semibold uppercase tracking-wide text-accent">
            {itemCount.toLocaleString("en-US")} items
          </span>
          <span className="rounded-full bg-surface-muted px-4 py-1 font-semibold text-muted">
            {groupedSections.length} {config.groupLabel.toLowerCase()} groups
          </span>
        </div>
      </header>

      <section id="article-body" itemProp="articleBody" className="article-content md-copy-scope copy-with-sidebar-space space-y-6">
        {introNodes ? introNodes : null}

        <CatalogAdSlot />

        <ForgeCatalogNav activeSlug={config.slug} />

        {sectionNav.length > 1 ? <ForgeSectionNav sections={sectionNav} /> : null}

        <ForgeCatalogView sections={groupedSections} config={config} />

        <CatalogAdSlot />

        {hasDetails ? (
          <>
            {descriptionNodes.length ? descriptionNodes : null}

            {howNodes ? howNodes : null}

            {contentHtml?.ctaLabel && contentHtml?.ctaUrl ? (
              <p data-md-copy className="md-copy-node md-copy-p">
                {contentHtml.ctaLabel}{" "}
                <a
                  href={contentHtml.ctaUrl}
                  className="rounded-full bg-accent px-6 py-2 text-sm font-semibold text-white transition hover:bg-accent-dark"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Learn More
                </a>
              </p>
            ) : null}

            {faqNodes.length ? (
              <>
                <div className="space-y-4">
                  <h2 className="text-2xl font-semibold text-foreground">Frequently Asked Questions</h2>
                  <div className="space-y-4">
                    {faqNodes.map((faq, index) => (
                      <details
                        key={index}
                        className="group rounded-2xl border border-border/60 bg-surface p-5 transition hover:border-accent/60"
                      >
                        <summary className="cursor-pointer text-lg font-semibold text-foreground">{faq.q}</summary>
                        {faq.nodes}
                      </details>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </section>

      {contentHtml?.id ? (
        <div className="mt-10">
          <CommentsSection entityType="catalog" entityId={contentHtml.id} />
        </div>
      ) : null}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: pageSchema }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: listSchema }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbSchema }} />
    </div>
  );
}
