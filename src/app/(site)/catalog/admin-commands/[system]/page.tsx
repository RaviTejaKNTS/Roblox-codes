import type { Metadata } from "next";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/styles/article-content.css";
import { CopyCodeButton } from "@/components/CopyCodeButton";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { renderMarkdown } from "@/lib/markdown";
import { getCatalogPageContentByCodes } from "@/lib/catalog";
import { ADMIN_COMMANDS_DESCRIPTION, resolveSeoTitle, SITE_NAME, SITE_URL, buildAlternates } from "@/lib/seo";
import { getAdminCommandSystems, loadAdminCommandDataset, loadAdminCommandDatasets } from "@/lib/admin-commands";

export const revalidate = 86400;

const CANONICAL_BASE = `${SITE_URL.replace(/\/$/, "")}/catalog/admin-commands`;
const INLINE_PREFIX_PATTERN = /^[;:!\/]/;

const HEADER_MAP: Record<string, string> = {
  Command: "command",
  Commands: "commandList",
  Aliases: "aliases",
  "Undo Aliases": "undoAliases",
  Args: "args",
  Usage: "usage",
  Prefix: "prefix",
  "Admin Level": "adminLevel",
  Description: "description"
};

type NormalizedRow = {
  command?: string;
  commandList?: string;
  aliases?: string;
  undoAliases?: string;
  args?: string;
  usage?: string;
  prefix?: string;
  adminLevel?: string;
  description?: string;
};

type NormalizedSection = {
  id: string;
  title: string;
  commands: CommandItem[];
};

type CommandItem = {
  id: string;
  commandLine: string;
  copyText: string;
  args: string[];
  aliases: string[];
  description: string | null;
};

type CatalogContentHtml = {
  id?: string | null;
  title: string | null;
  introHtml: string;
  howHtml: string;
  descriptionHtml: Array<{ key: string; html: string }>;
  faqHtml: Array<{ q: string; a: string }>;
  ctaLabel: string | null;
  ctaUrl: string | null;
  updatedAt: string | null;
};

export function generateStaticParams() {
  return getAdminCommandSystems().map((system) => ({ system: system.slug }));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function sortDescriptionEntries(description: Record<string, string> | null | undefined) {
  return Object.entries(description ?? {}).sort((a, b) => {
    const left = Number.parseInt(a[0], 10);
    const right = Number.parseInt(b[0], 10);
    if (Number.isNaN(left) && Number.isNaN(right)) return a[0].localeCompare(b[0]);
    if (Number.isNaN(left)) return 1;
    if (Number.isNaN(right)) return -1;
    return left - right;
  });
}

function normalizeTextValue(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/\\n/g, " ")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function mapRow(headers: string[], row: string[]): NormalizedRow {
  const mapped: NormalizedRow = {};
  headers.forEach((header, index) => {
    const key = HEADER_MAP[header];
    if (!key) return;
    mapped[key as keyof NormalizedRow] = row[index] ?? "";
  });
  return mapped;
}

function splitCommandList(value: string): { primary: string; aliases: string[] } {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    primary: parts[0] ?? "",
    aliases: parts.slice(1)
  };
}

function splitAliasList(value: string | undefined): string[] {
  const normalized = normalizeTextValue(value);
  if (!normalized) return [];
  return normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function dedupeList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizePrefix(value: string | undefined): string {
  const normalized = normalizeTextValue(value);
  if (!normalized) return "";
  return normalized.split(/\s+/)[0] ?? "";
}

function humanizeCommandName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

function buildCommandParts(commandLabel: string, prefixOverride: string, defaultPrefix: string) {
  const trimmed = commandLabel.trim();
  const hasInlinePrefix = INLINE_PREFIX_PATTERN.test(trimmed);
  const inlinePrefix = hasInlinePrefix ? trimmed[0] : "";
  const name = hasInlinePrefix ? trimmed.slice(1) : trimmed;
  const resolvedPrefix = inlinePrefix || prefixOverride || defaultPrefix;
  const commandName = name || trimmed;
  const fullCommand = resolvedPrefix ? `${resolvedPrefix}${commandName}` : commandName;
  return {
    prefix: resolvedPrefix,
    name: commandName,
    fullCommand
  };
}

type ArgDescriptor = {
  label: string;
};

function extractArgTokens(rawArgs: string): string[] {
  const normalized = normalizeTextValue(rawArgs);
  if (!normalized) return [];
  const bracketTokens = Array.from(normalized.matchAll(/(?:^|[\s,])\[([^\]]+)\]/g)).map((match) => match[1]);
  const angleTokens = Array.from(normalized.matchAll(/(?:^|[\s,])<([^>]+)>/g)).map((match) => match[1]);
  const tokens = [...bracketTokens, ...angleTokens].map((match) => match.trim()).filter(Boolean);
  if (tokens.length) return tokens;
  return normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeArgLabel(raw: string, options: string[]): string {
  const normalized = humanizeCommandName(raw);
  const lower = normalized.toLowerCase();
  if (/player|user|member|target/.test(lower)) return "player";
  if (/user\s*id|userid/.test(lower)) return "user-id";
  if (/place\s*id|placeid/.test(lower)) return "place-id";
  if (/asset\s*id|assetid/.test(lower)) return "asset-id";
  if (/true|false|on|off/.test(lower) && options.length > 1) return "toggle";
  if (options.length > 1) return "option";
  const label = lower.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return label || "value";
}

function parseArgDescriptor(rawToken: string): ArgDescriptor | null {
  const trimmed = rawToken.trim();
  if (!trimmed) return null;
  const cleaned = trimmed
    .replace(/optional/gi, "")
    .replace(/\?$/, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/default:.*/i, "")
    .replace(/[<>\[\]]/g, "")
    .trim();
  if (!cleaned) return null;
  const options = cleaned
    .split(/\/|\s+or\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const base = options[0] ?? cleaned;
  const label = normalizeArgLabel(base, options);
  return {
    label
  };
}

function buildArgDescriptors(rawArgs: string): ArgDescriptor[] {
  const tokens = extractArgTokens(rawArgs);
  return tokens
    .map(parseArgDescriptor)
    .filter(Boolean) as ArgDescriptor[];
}

function buildArgDisplay(descriptors: ArgDescriptor[]): string {
  if (!descriptors.length) return "";
  return descriptors.map((arg) => `<${arg.label}>`).join(" ");
}

function formatArgLabel(label: string): string {
  const normalized = humanizeCommandName(label)
    .replace(/([a-z])(\d)/gi, "$1 $2")
    .replace(/(\d)([a-z])/gi, "$1 $2");
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const caps = new Set(["id", "ui", "ip", "fps", "xp", "hp", "x", "y", "z"]);
  return tokens
    .map((token) => {
      if (/^\d+$/.test(token)) return token;
      if (caps.has(token)) return token.toUpperCase();
      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join(" ");
}

function stripInlineArgs(commandLabel: string): string {
  return commandLabel
    .replace(/\s*(?:\[[^\]]+\]|<[^>]+>)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function buildCommandDescription(baseDescription: string): string | null {
  const trimmed = baseDescription.trim();
  if (!trimmed) return null;
  const actionDescription = ensureSentence(trimmed);
  return actionDescription.trim() || null;
}

function buildSections(dataset: Awaited<ReturnType<typeof loadAdminCommandDataset>>): NormalizedSection[] {
  if (!dataset) return [];
  const usedIds = new Set<string>();
  const sections: NormalizedSection[] = [];
  const defaultPrefix = normalizePrefix(dataset.defaultPrefixes[0]);

  for (let index = 0; index < dataset.sections.length; index += 1) {
    const section = dataset.sections[index];
    const baseId = slugify(section.title || `section-${index + 1}`);
    let sectionId = baseId || `section-${index + 1}`;
    if (usedIds.has(sectionId)) {
      sectionId = `${sectionId}-${index + 1}`;
    }
    usedIds.add(sectionId);

    const commands: CommandItem[] = [];

    section.rows.forEach((row, rowIndex) => {
      const mapped = mapRow(section.headers, row);
      const commandSource = normalizeTextValue(mapped.command || mapped.commandList);
      if (!commandSource) return;

      const { primary, aliases } = splitCommandList(commandSource);
      const commandLabel = primary || commandSource;
      const hasInlineArgs = /(\[[^\]]+\]|<[^>]+>)/.test(commandLabel);
      const prefixOverride = normalizePrefix(mapped.prefix);
      const cleanedLabel = hasInlineArgs ? stripInlineArgs(commandLabel) : commandLabel;
      const parts = buildCommandParts(cleanedLabel, prefixOverride, defaultPrefix);
      const aliasList = dedupeList([...splitAliasList(mapped.aliases), ...aliases]);
      const rawArgs = normalizeTextValue(mapped.usage || mapped.args);
      const argSource = rawArgs || (hasInlineArgs ? commandLabel : "");
      const args = buildArgDescriptors(argSource);
      const argsDisplay = buildArgDisplay(args);
      const commandLine = parts.fullCommand.trim();
      const copyText = `${parts.fullCommand}${argsDisplay ? ` ${argsDisplay}` : ""}`.trim();
      const baseDescription = normalizeTextValue(mapped.description);
      const description = buildCommandDescription(baseDescription);
      const commandId = `${sectionId}-${slugify(parts.name)}-${rowIndex + 1}`;
      const argLabels = dedupeList(args.map((arg) => formatArgLabel(arg.label))).filter(Boolean);

      commands.push({
        id: commandId,
        commandLine,
        copyText,
        args: argLabels,
        aliases: aliasList,
        description
      });
    });

    if (commands.length) {
      sections.push({
        id: sectionId,
        title: section.title,
        commands
      });
    }
  }

  return sections;
}

function getCatalogCodeCandidates(systemSlug: string): string[] {
  return [`admin-commands/${systemSlug}`];
}

async function buildCatalogContent(systemSlug: string): Promise<{ contentHtml: CatalogContentHtml | null }> {
  const catalog = await getCatalogPageContentByCodes(getCatalogCodeCandidates(systemSlug));
  if (!catalog) {
    return { contentHtml: null };
  }

  const introHtml = catalog.intro_md ? await renderMarkdown(catalog.intro_md, { paragraphizeLineBreaks: true }) : "";
  const howHtml = catalog.how_it_works_md ? await renderMarkdown(catalog.how_it_works_md, { paragraphizeLineBreaks: true }) : "";

  const descriptionEntries = sortDescriptionEntries(catalog.description_json ?? {});
  const descriptionHtml = await Promise.all(
    descriptionEntries.map(async ([key, value]) => ({
      key,
      html: await renderMarkdown(value ?? "", { paragraphizeLineBreaks: true })
    }))
  );

  const faqEntries = Array.isArray(catalog.faq_json) ? catalog.faq_json : [];
  const faqHtml = await Promise.all(
    faqEntries.map(async (entry) => ({
      q: entry.q,
      a: await renderMarkdown(entry.a ?? "", { paragraphizeLineBreaks: true })
    }))
  );

  return {
    contentHtml: {
      id: catalog.id ?? null,
      title: catalog.title ?? null,
      introHtml,
      howHtml,
      descriptionHtml,
      faqHtml,
      ctaLabel: catalog.cta_label ?? null,
      ctaUrl: catalog.cta_url ?? null,
      updatedAt: catalog.content_updated_at ?? catalog.updated_at ?? catalog.published_at ?? catalog.created_at ?? null
    }
  };
}

export async function generateMetadata({ params }: { params: Promise<{ system: string }> }): Promise<Metadata> {
  const { system } = await params;
  const dataset = await loadAdminCommandDataset(system);
  if (!dataset) {
    return {
      title: `Roblox Admin Commands | ${SITE_NAME}`,
      description: ADMIN_COMMANDS_DESCRIPTION,
      alternates: buildAlternates(CANONICAL_BASE)
    };
  }

  const catalog = await getCatalogPageContentByCodes(getCatalogCodeCandidates(system));
  const title =
    resolveSeoTitle(catalog?.seo_title) ??
    catalog?.title ??
    `${dataset.system.name} Commands | ${SITE_NAME}`;
  const description =
    catalog?.meta_description ??
    dataset.system.cardDescription ??
    ADMIN_COMMANDS_DESCRIPTION;
  const canonical = `${CANONICAL_BASE}/${dataset.system.slug}`;

  return {
    title,
    description,
    alternates: buildAlternates(canonical),
    openGraph: {
      type: "article",
      url: canonical,
      title,
      description,
      siteName: SITE_NAME
    },
    twitter: {
      card: "summary_large_image",
      title,
      description
    }
  };
}

export default async function AdminCommandSystemPage({ params }: { params: Promise<{ system: string }> }) {
  const { system } = await params;
  const [{ contentHtml }, datasets] = await Promise.all([
    buildCatalogContent(system),
    loadAdminCommandDatasets(),
  ]);
  const dataset = datasets.find((entry) => entry.system.slug === system);
  if (!dataset) {
    notFound();
  }

  const sections = buildSections(dataset);
  const pageTitle = contentHtml?.title?.trim() ? contentHtml.title.trim() : `${dataset.system.name} commands`;
  const introHtml = contentHtml?.introHtml?.trim() ? contentHtml.introHtml : "";
  const howHtml = contentHtml?.howHtml?.trim() ? contentHtml.howHtml : "";
  const descriptionHtml = contentHtml?.descriptionHtml ?? [];
  const faqHtml = contentHtml?.faqHtml ?? [];
  const showCta = Boolean(contentHtml?.ctaLabel && contentHtml?.ctaUrl);
  const updatedDateValue = contentHtml?.updatedAt ?? dataset.generatedOn ?? null;
  const updatedDate = updatedDateValue ? new Date(updatedDateValue) : null;
  const formattedUpdated = updatedDate
    ? updatedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;
  const updatedRelativeLabel = updatedDate ? formatDistanceToNow(updatedDate, { addSuffix: true }) : null;
  const categoryCount = sections.length;
  const systemNavItems = datasets.map((entry) => ({
    id: entry.system.slug,
    title: entry.system.name,
    description: entry.system.cardDescription,
    href: `/catalog/admin-commands/${entry.system.slug}`,
    commandCount: entry.commandCount
  }));

  return (
    <div className="space-y-10">
      <nav aria-label="Breadcrumb" className="text-xs uppercase tracking-[0.25em] text-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li className="flex items-center gap-2">
            <Link href="/" className="font-semibold text-muted transition hover:text-accent">
              Home
            </Link>
            <span className="text-muted/60">&gt;</span>
          </li>
          <li className="flex items-center gap-2">
            <Link href="/catalog" className="font-semibold text-muted transition hover:text-accent">
              Catalog
            </Link>
            <span className="text-muted/60">&gt;</span>
          </li>
          <li className="flex items-center gap-2">
            <Link href="/catalog/admin-commands" className="font-semibold text-muted transition hover:text-accent">
              Admin Commands
            </Link>
            <span className="text-muted/60">&gt;</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="font-semibold text-foreground/80">{pageTitle}</span>
          </li>
        </ol>
      </nav>

      <header className="space-y-3">
        <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-5xl">
          {pageTitle}
        </h1>
        {formattedUpdated ? (
          <p className="text-sm text-foreground/80">
            Updated on <span className="font-semibold text-foreground">{formattedUpdated}</span>
            {updatedRelativeLabel ? <span>{' '}({updatedRelativeLabel})</span> : null}
          </p>
        ) : null}
      </header>

      {introHtml ? (
        <section
          className="article-content prose dark:prose-invert game-copy max-w-3xl"
          dangerouslySetInnerHTML={{ __html: introHtml }}
        />
      ) : null}

      {systemNavItems.length ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {systemNavItems.map((item) => {
            const isActive = item.id === dataset.system.slug;
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
                    <p className="text-lg font-semibold text-foreground">{item.title}</p>
                    {isActive ? (
                      <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                        Active
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted">{item.description}</p>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                    {item.commandCount.toLocaleString("en-US")} commands
                  </p>
                </div>
              </article>
            );

            if (isActive) {
              return (
                <div key={item.id} className="h-full" aria-current="page">
                  {card}
                </div>
              );
            }

            return (
              <Link key={item.id} href={item.href} className="block h-full">
                {card}
              </Link>
            );
          })}
        </section>
      ) : null}

      {sections.length ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">Command categories</h2>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              {categoryCount.toLocaleString("en-US")} categories
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-full border border-border/70 bg-background/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted transition hover:border-accent/70 hover:text-accent"
              >
                {section.title}
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-8">
        {sections.map((section) => (
          <div key={section.id} id={section.id} className="space-y-4 scroll-mt-24">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-foreground md:text-2xl">{section.title}</h3>
              <span className="rounded-full bg-surface-muted px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                {section.commands.length.toLocaleString("en-US")} commands
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {section.commands.map((command) => (
                <div
                  key={command.id}
                  className="rounded-2xl border border-border/60 bg-surface/60 p-4 shadow-sm"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words font-mono text-xl font-semibold leading-snug text-foreground md:text-2xl">
                        {command.commandLine}
                      </span>
                      {command.args.length
                        ? command.args.map((arg, argIndex) => (
                            <span
                              key={`${command.id}-arg-${argIndex}`}
                              className="inline-flex items-center justify-center rounded-md border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-semibold text-accent"
                            >
                              {arg}
                            </span>
                          ))
                        : null}
                    </div>
                    <div className="shrink-0 pt-1">
                      <CopyCodeButton
                        code={command.copyText}
                        size="sm"
                        tone="accent"
                        analytics={{
                          event: "admin_command_copy",
                          params: {
                            system_slug: dataset.system.slug,
                            command_id: command.id || command.copyText
                          }
                        }}
                      />
                    </div>
                  </div>

                  {command.aliases.length || command.description ? (
                    <div className="mt-3 space-y-2">
                      {command.aliases.length ? (
                        <p className="text-xs text-muted">
                          <span className="font-semibold uppercase tracking-[0.2em] text-muted/70">Aliases</span>
                          <span className="ml-2">{command.aliases.join(", ")}</span>
                        </p>
                      ) : null}

                      {command.description ? (
                        <p className="text-sm leading-relaxed text-muted">{command.description}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {descriptionHtml.length ? (
        <section className="article-content prose dark:prose-invert game-copy max-w-3xl">
          {descriptionHtml.map((entry) => (
            <div key={entry.key} dangerouslySetInnerHTML={{ __html: entry.html }} />
          ))}
        </section>
      ) : null}

      {howHtml ? (
        <section className="article-content prose dark:prose-invert game-copy max-w-3xl">
          <div dangerouslySetInnerHTML={{ __html: howHtml }} />
        </section>
      ) : null}

      {showCta ? (
        <section className="rounded-2xl border border-border/60 bg-surface/60 p-5 shadow-soft">
          <a
            href={contentHtml?.ctaUrl ?? "#"}
            className="inline-flex items-center justify-center rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:opacity-90"
          >
            {contentHtml?.ctaLabel}
          </a>
        </section>
      ) : null}

      {faqHtml.length ? (
        <section className="rounded-2xl border border-border/60 bg-surface/40 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">FAQ</h2>
          <div className="mt-3 space-y-4">
            {faqHtml.map((faq, idx) => (
              <div key={`${faq.q}-${idx}`} className="rounded-xl border border-border/40 bg-background/60 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">Q.</span>
                  <p className="text-base font-semibold text-foreground">{faq.q}</p>
                </div>
                <div
                  className="prose mt-2"
                  dangerouslySetInnerHTML={{ __html: faq.a }}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {contentHtml?.id ? (
        <div className="mt-10">
          <CommentsSection entityType="catalog" entityId={contentHtml.id} />
        </div>
      ) : null}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: pageTitle,
            description: dataset.system.cardDescription,
            url: `${CANONICAL_BASE}/${dataset.system.slug}`
          })
        }}
      />
    </div>
  );
}
