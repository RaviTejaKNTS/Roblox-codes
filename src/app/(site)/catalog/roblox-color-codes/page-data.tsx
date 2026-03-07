import fs from "node:fs/promises";
import path from "node:path";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import type { ReactNode } from "react";
import { CatalogAdSlot } from "@/components/CatalogAdSlot";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { breadcrumbJsonLd, SITE_URL, webPageJsonLd } from "@/lib/seo";
import { processHtmlLinks } from "@/lib/link-utils";
import { renderHtmlAsReactNodes } from "@/lib/html-to-react";
import { ColorCodesGrid, type ColorCodeItem } from "./ColorCodesGrid";
import { HexColorPicker } from "./HexColorPicker";

export const BASE_PATH = "/catalog/roblox-color-codes";
export const CANONICAL = `${SITE_URL.replace(/\/$/, "")}${BASE_PATH}`;
const COLOR_CODES_COMMENTS_ENTITY_ID = "8f3f4c0c-d1e6-4a80-9b7b-57f1f589e5b6";

const COLOR_CODES_DATA_FILE = path.join(process.cwd(), "data", "Color Codes", "roblox-color-codes.json");

type ColorCodesDataset = {
  meta: {
    title?: string;
    updatedAt?: string;
    itemCount?: number;
  };
  items: ColorCodeItem[];
};

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

export type BreadcrumbItem = {
  label: string;
  href?: string | null;
};

function renderCatalogNodes(html: string, keyPrefix: string): ReactNode[] {
  return renderHtmlAsReactNodes(processHtmlLinks(html).__html, { keyPrefix });
}

export async function loadRobloxColorCodesPageData(): Promise<ColorCodesDataset> {
  try {
    const file = await fs.readFile(COLOR_CODES_DATA_FILE, "utf8");
    const parsed = JSON.parse(file) as ColorCodesDataset;
    return {
      meta: parsed.meta ?? {},
      items: Array.isArray(parsed.items) ? parsed.items : []
    };
  } catch (error) {
    console.error("Failed to load Roblox color codes dataset", error);
    return {
      meta: {},
      items: []
    };
  }
}

export function ColorCodesBreadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
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

function buildColorCodeItemListSchema({
  title,
  description,
  url,
  items
}: {
  title: string;
  description: string;
  url: string;
  items: ColorCodeItem[];
}) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    description,
    url,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Thing",
        name: item.name,
        identifier: String(item.number),
        color: item.hex,
        additionalProperty: [
          {
            "@type": "PropertyValue",
            name: "BrickColor number",
            value: item.number
          },
          {
            "@type": "PropertyValue",
            name: "RGB 0-255",
            value: item.rgb255
          },
          {
            "@type": "PropertyValue",
            name: "RGB 0-1",
            value: item.rgb01
          }
        ]
      }
    }))
  });
}

export function renderRobloxColorCodesPage({
  items,
  updatedAt,
  contentHtml
}: {
  items: ColorCodeItem[];
  updatedAt: string | null;
  contentHtml?: CatalogContentHtml | null;
}) {
  const baseTitle = contentHtml?.title?.trim() ? contentHtml.title.trim() : "Roblox color codes";
  const introHtml = contentHtml?.introHtml?.trim() ? contentHtml.introHtml : "";
  const descriptionHtml = contentHtml?.descriptionHtml ?? [];
  const howHtml = contentHtml?.howHtml?.trim() ? contentHtml.howHtml : "";
  const faqHtml = contentHtml?.faqHtml ?? [];
  const updatedDate = updatedAt ? new Date(updatedAt) : null;
  const formattedUpdated = updatedDate
    ? updatedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;
  const updatedRelativeLabel = updatedDate ? formatDistanceToNow(updatedDate, { addSuffix: true }) : null;
  const introNodes = introHtml ? renderCatalogNodes(introHtml, "color-intro") : null;
  const descriptionNodes = descriptionHtml.flatMap((entry) =>
    renderCatalogNodes(entry.html, `color-description-${entry.key}`)
  );
  const howNodes = howHtml ? renderCatalogNodes(howHtml, "color-how") : null;
  const faqNodes = faqHtml.map((faq, idx) => ({
    ...faq,
    nodes: renderCatalogNodes(faq.a, `color-faq-${idx}`)
  }));
  const canonicalUrl = `${SITE_URL.replace(/\/$/, "")}${BASE_PATH}`;
  const description = "Browse every official Roblox BrickColor in one catalog with exact swatches, numbers, RGB values, and copy-ready color data.";
  const updatedIso = updatedDate ? updatedDate.toISOString() : new Date().toISOString();
  const pageSchema = JSON.stringify(
    webPageJsonLd({
      siteUrl: SITE_URL,
      slug: BASE_PATH.replace(/^\//, ""),
      title: baseTitle,
      description,
      image: `${SITE_URL}/og-image.png`,
      author: null,
      publishedAt: updatedIso,
      updatedAt: updatedIso
    })
  );
  const listSchema = buildColorCodeItemListSchema({
    title: baseTitle,
    description,
    url: canonicalUrl,
    items
  });
  const breadcrumbSchema = JSON.stringify(
    breadcrumbJsonLd([
      { name: "Home", url: SITE_URL },
      { name: "Catalog", url: `${SITE_URL.replace(/\/$/, "")}/catalog` },
      { name: "Roblox color codes", url: canonicalUrl }
    ])
  );
  const hasDetails =
    Boolean(descriptionNodes.length) || Boolean(howNodes) || Boolean(faqNodes.length) ||
    Boolean(contentHtml?.ctaLabel && contentHtml?.ctaUrl);
  const commentsEntityId = contentHtml?.id ?? COLOR_CODES_COMMENTS_ENTITY_ID;

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <ColorCodesBreadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: "Catalog", href: "/catalog" },
            { label: "Roblox color codes", href: null }
          ]}
        />
        <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-5xl">{baseTitle}</h1>
        {formattedUpdated ? (
          <p className="text-sm text-foreground/80">
            Updated on <span className="font-semibold text-foreground">{formattedUpdated}</span>
            {updatedRelativeLabel ? <span>{' '}({updatedRelativeLabel})</span> : null}
          </p>
        ) : null}
      </header>

      <section id="article-body" itemProp="articleBody" className="article-content md-copy-scope copy-with-sidebar-space space-y-6">
        {introNodes ? introNodes : null}

        <p data-md-copy className="md-copy-node md-copy-p">
          Bloxodes&apos; Roblox Color Codes Catalog is a fast way to explore and copy the most useful Roblox colors.
          This page includes a <code>Color3</code> hex color picker for generating custom colors and a complete set of
          Roblox <code>BrickColor</code> codes you can quickly browse and copy.
        </p>
        <p data-md-copy className="md-copy-node md-copy-p">
          Whether you are building maps, styling UI, creating gradients, or matching colors across parts, this page
          helps you find the right Roblox color code in seconds.
        </p>
        <p data-md-copy className="md-copy-node md-copy-p">
          Because Roblox uses two main color systems, <code>Color3</code> for custom colors and
          <code> BrickColor</code> for preset palette colors, we put both tools on one page so you can quickly pick,
          copy, and use the color you need.
        </p>

        <h2 data-md-copy className="md-copy-node md-copy-heading md-copy-h2">Roblox BrickColor Codes</h2>
        <p data-md-copy className="md-copy-node md-copy-p">
          Roblox uses a classic color system called <code>BrickColor</code>. These are predefined colors built into
          Roblox and are commonly used for parts and other in-game objects.
        </p>
        <p data-md-copy className="md-copy-node md-copy-p">Each <code>BrickColor</code> has:</p>
        <ul data-md-copy className="md-copy-node md-copy-list md-copy-ul">
          <li>a name, such as <code>Bright red</code> or <code>Medium stone grey</code></li>
          <li>a number ID</li>
          <li>an RGB value</li>
        </ul>
        <p data-md-copy className="md-copy-node md-copy-p">
          Below, you&apos;ll find Roblox <code>BrickColor</code> cards showing the color, its name, and its code so you
          can quickly find the one you want. If you need a preset Roblox color, this is the section to use.
        </p>

        <CatalogAdSlot />

        <ColorCodesGrid items={items} />

        <h2 data-md-copy className="md-copy-node md-copy-heading md-copy-h2">Hex Color Picker (Color3)</h2>
        <p data-md-copy className="md-copy-node md-copy-p">
          If you want more control over color, Roblox also uses <code>Color3</code>. Unlike <code>BrickColor</code>,
          which is based on a fixed preset palette, <code>Color3</code> lets you work with almost any color using RGB
          or hex values.
        </p>
        <p data-md-copy className="md-copy-node md-copy-p">
          Use the color picker below to choose a color and instantly view the hex and RGB values you can use in
          Roblox Studio. This is useful for UI design, lighting, gradients, and other detailed visual effects.
        </p>
        <p data-md-copy className="md-copy-node md-copy-p">
          Once you find a color you like, you can use those values directly in Roblox <code>Color3</code>.
        </p>

        <HexColorPicker items={items} />

        <h2 data-md-copy className="md-copy-node md-copy-heading md-copy-h2">How to Use Roblox Color Codes</h2>
        <p data-md-copy className="md-copy-node md-copy-p">
          Using these color codes in Roblox is simple. Here are quick examples you can copy and use.
        </p>

        <h3 data-md-copy className="md-copy-node md-copy-heading md-copy-h3">Using BrickColor (by name)</h3>
        <pre data-md-copy className="md-copy-node overflow-x-auto rounded-2xl border border-border/60 bg-surface/50 p-4">
          <code>part.BrickColor = BrickColor.new("Bright red")</code>
        </pre>

        <h3 data-md-copy className="md-copy-node md-copy-heading md-copy-h3">Using BrickColor (by ID)</h3>
        <pre data-md-copy className="md-copy-node overflow-x-auto rounded-2xl border border-border/60 bg-surface/50 p-4">
          <code>part.BrickColor = BrickColor.new(21)</code>
        </pre>

        <h3 data-md-copy className="md-copy-node md-copy-heading md-copy-h3">Using BrickColor from RGB (closest match)</h3>
        <p data-md-copy className="md-copy-node md-copy-p">
          Roblox will pick the closest <code>BrickColor</code> that matches those RGB values.
        </p>
        <pre data-md-copy className="md-copy-node overflow-x-auto rounded-2xl border border-border/60 bg-surface/50 p-4">
          <code>part.BrickColor = BrickColor.new(0.769, 0.157, 0.110)</code>
        </pre>

        <h3 data-md-copy className="md-copy-node md-copy-heading md-copy-h3">Using Color3 with RGB</h3>
        <pre data-md-copy className="md-copy-node overflow-x-auto rounded-2xl border border-border/60 bg-surface/50 p-4">
          <code>part.Color = Color3.fromRGB(196, 40, 28)</code>
        </pre>

        <h3 data-md-copy className="md-copy-node md-copy-heading md-copy-h3">Using Color3 with Hex</h3>
        <pre data-md-copy className="md-copy-node overflow-x-auto rounded-2xl border border-border/60 bg-surface/50 p-4">
          <code>part.Color = Color3.fromHex("#FF0000")</code>
        </pre>

        <h3 data-md-copy className="md-copy-node md-copy-heading md-copy-h3">Quick examples of where these are used</h3>
        <ul data-md-copy className="md-copy-node md-copy-list md-copy-ul">
          <li>Coloring parts and blocks in builds</li>
          <li>Styling UI elements like Frames and TextLabels</li>
          <li>Creating gradients and visual effects</li>
          <li>Matching colors across your game&apos;s theme</li>
        </ul>

        <p data-md-copy className="md-copy-node md-copy-p">
          If you want quick Roblox preset colors, use <code>BrickColor</code>. If you want exact or custom colors, use
          <code> Color3</code> with RGB or hex values.
        </p>
        <p data-md-copy className="md-copy-node md-copy-p">
          With the hex picker and the <code>BrickColor</code> list on this page, you can quickly find and copy the
          color codes you need while building in Roblox.
        </p>

        <CatalogAdSlot />

        {hasDetails ? (
          <>
            {descriptionNodes.length ? descriptionNodes : null}

            {howNodes ? howNodes : null}

            {contentHtml?.ctaLabel && contentHtml?.ctaUrl ? (
              <>
                <h3 data-md-copy className="md-copy-node md-copy-heading md-copy-h3">Next step</h3>
                <p data-md-copy className="md-copy-node md-copy-p">Keep exploring more Roblox catalog tools.</p>
                <p data-md-copy className="md-copy-node md-copy-p">
                  <a
                    href={contentHtml.ctaUrl}
                    className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accent-dark dark:bg-accent-dark dark:hover:bg-accent"
                  >
                    {contentHtml.ctaLabel}
                  </a>
                </p>
              </>
            ) : null}

            {faqNodes.length ? (
              <section className="rounded-2xl border border-border/60 bg-surface/40 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-foreground">FAQ</h2>
                <div className="mt-3 space-y-4">
                  {faqNodes.map((faq, idx) => (
                    <div key={`${faq.q}-${idx}`} className="rounded-xl border border-border/40 bg-background/60 p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">Q.</span>
                        <p className="text-base font-semibold text-foreground">{faq.q}</p>
                      </div>
                      {faq.nodes}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </section>

      <CommentsSection entityType="catalog" entityId={commentsEntityId} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: pageSchema }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: listSchema }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbSchema }} />
    </div>
  );
}
