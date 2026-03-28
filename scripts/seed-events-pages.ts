import "dotenv/config";

import OpenAI from "openai";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { slugify } from "@/lib/slug";
import { revalidateEventSlugs } from "./lib/revalidate-events";
import { tavilySearch } from "./lib/tavily";

const SOURCE_BATCH = Number(process.env.EVENTS_PAGES_SOURCE_BATCH ?? "1000");
const DEFAULT_PUBLISHED = (process.env.EVENTS_PAGES_PUBLISHED ?? "true").toLowerCase() !== "false";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

type UniverseRow = {
  universe_id: number;
  display_name: string | null;
  name: string | null;
  slug: string | null;
};

type EventsPageRow = {
  universe_id: number;
  slug: string | null;
  title: string | null;
  content_md: string | null;
  seo_title: string | null;
  meta_description: string | null;
  is_published: boolean | null;
};

type GenerateCopyResult = {
  content_md: string;
  meta_description: string;
};

type ScriptArgs = {
  slug: string | null;
  universeId: number | null;
  force: boolean;
};

if (!TAVILY_API_KEY) {
  throw new Error("Missing TAVILY_API_KEY.");
}

if (!OPENAI_KEY) {
  throw new Error("Missing OPENAI_API_KEY.");
}

const openai = new OpenAI({ apiKey: OPENAI_KEY });

async function requestModelText(params: {
  system: string;
  prompt: string;
  maxTokens: number;
  temperature?: number;
}): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: params.temperature ?? 0.2,
    max_tokens: params.maxTokens,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.prompt }
    ]
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseArgs(): ScriptArgs {
  const args = process.argv.slice(2);
  let slug: string | null = null;
  let universeId: number | null = null;
  let force = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--slug") {
      slug = args[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg.startsWith("--slug=")) {
      slug = arg.slice("--slug=".length) || null;
      continue;
    }
    if (arg === "--universe-id") {
      const next = args[i + 1];
      if (next) {
        const parsed = Number(next);
        universeId = Number.isFinite(parsed) ? parsed : null;
      }
      i += 1;
      continue;
    }
    if (arg.startsWith("--universe-id=")) {
      const parsed = Number(arg.slice("--universe-id=".length));
      universeId = Number.isFinite(parsed) ? parsed : null;
      continue;
    }
    if (!slug && !universeId) {
      const parsed = Number(arg);
      if (Number.isFinite(parsed)) {
        universeId = parsed;
      } else {
        slug = arg;
      }
    }
  }

  return {
    slug: normalizeText(slug),
    universeId,
    force
  };
}

async function fetchUniverseIds(): Promise<number[]> {
  const sb = supabaseAdmin();
  const ids = new Set<number>();
  let offset = 0;

  while (true) {
    const { data, error } = await sb
      .from("roblox_virtual_events")
      .select("universe_id")
      .order("universe_id", { ascending: true })
      .range(offset, offset + SOURCE_BATCH - 1);

    if (error) {
      throw new Error(`Failed to load virtual events: ${error.message}`);
    }

    const rows = (data ?? []) as Array<{ universe_id?: number | null }>;
    for (const row of rows) {
      if (typeof row.universe_id === "number") {
        ids.add(row.universe_id);
      }
    }

    if (rows.length < SOURCE_BATCH) break;
    offset += rows.length;
  }

  return Array.from(ids.values());
}

async function fetchUniverses(universeIds: number[]): Promise<Map<number, UniverseRow>> {
  const sb = supabaseAdmin();
  const map = new Map<number, UniverseRow>();

  for (const chunk of chunkArray(universeIds, 200)) {
    const { data, error } = await sb
      .from("roblox_universes")
      .select("universe_id, display_name, name, slug")
      .in("universe_id", chunk);

    if (error) {
      throw new Error(`Failed to load universes: ${error.message}`);
    }

    const rows = (data ?? []) as UniverseRow[];
    for (const row of rows) {
      map.set(row.universe_id, row);
    }
  }

  return map;
}

async function fetchExistingPages(universeIds: number[]): Promise<Map<number, EventsPageRow>> {
  const sb = supabaseAdmin();
  const map = new Map<number, EventsPageRow>();
  for (const chunk of chunkArray(universeIds, 200)) {
    const { data, error } = await sb
      .from("events_pages")
      .select("universe_id, slug, title, content_md, seo_title, meta_description, is_published")
      .in("universe_id", chunk);

    if (error) {
      throw new Error(`Failed to load existing events pages: ${error.message}`);
    }

    for (const row of (data ?? []) as EventsPageRow[]) {
      if (typeof row.universe_id === "number") {
        map.set(row.universe_id, row);
      }
    }
  }
  return map;
}

async function fetchPageBySlug(slug: string): Promise<EventsPageRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("events_pages")
    .select("universe_id, slug, title, content_md, seo_title, meta_description, is_published")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load events page by slug: ${error.message}`);
  }

  return (data as EventsPageRow | null) ?? null;
}

async function fetchPageByUniverseId(universeId: number): Promise<EventsPageRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("events_pages")
    .select("universe_id, slug, title, content_md, seo_title, meta_description, is_published")
    .eq("universe_id", universeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load events page by universe: ${error.message}`);
  }

  return (data as EventsPageRow | null) ?? null;
}

async function fetchUniverseBySlug(slug: string): Promise<UniverseRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("roblox_universes")
    .select("universe_id, display_name, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load universe by slug: ${error.message}`);
  }

  return (data as UniverseRow | null) ?? null;
}

async function ensureUniverseHasEvents(universeId: number): Promise<void> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("roblox_virtual_events")
    .select("event_id")
    .eq("universe_id", universeId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify virtual events: ${error.message}`);
  }

  if (!data) {
    throw new Error(`No virtual events found for universe ${universeId}.`);
  }
}

async function ensureUniqueSlug(base: string, universeId: number): Promise<string> {
  const sb = supabaseAdmin();
  const fallbackBase = base || `universe-${universeId}`;
  let slug = fallbackBase;

  const { data, error } = await sb
    .from("events_pages")
    .select("universe_id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check slug availability: ${error.message}`);
  }

  if (!data || data.universe_id === universeId) {
    return slug;
  }

  slug = `${fallbackBase}-${universeId}`;

  return slug;
}

async function buildResearchNotes(gameName: string): Promise<string> {
  const search = await tavilySearch(`${gameName} Roblox game events gameplay rewards`, {
    includeAnswer: "advanced",
    maxResults: 5,
    searchDepth: "advanced",
    topic: "general"
  });
  const context = [
    search.answer ? `Tavily answer:\n${search.answer}` : null,
    ...(search.results ?? []).slice(0, 5).map((result, index) => {
      const content = result.raw_content ?? result.content ?? "";
      return `Source ${index + 1}\nTitle: ${result.title ?? "n/a"}\nURL: ${result.url ?? "n/a"}\nContent:\n${content}`;
    })
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = `
Game: "${gameName}"
Use only the supplied Tavily research context.
Provide concise research notes about:
- What this game is and its core loop or genre.
- How in-game events are described (live events, seasonal events, updates).
- Typical event cadence or schedule if known.
- Typical rewards or gameplay impact from events, if mentioned.
- Other details that are specific to this game's events in general that are must to know.
Avoid listing specific event names, dates, or times. No URLs.

Research context:
${context}
  `.trim();

  return requestModelText({
    system: "Return concise research notes. Do not include URLs. Use only the supplied Tavily research context.",
    prompt,
    maxTokens: 700,
    temperature: 0.2
  });
}

function parseCopyJson(raw: string): GenerateCopyResult {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const jsonText = start !== -1 && end !== -1 ? trimmed.slice(start, end + 1) : trimmed;
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Failed to parse JSON from model response: ${(error as Error).message}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Model response JSON was not an object.");
  }

  const content = (parsed as { content_md?: unknown }).content_md;
  const meta = (parsed as { meta_description?: unknown }).meta_description;

  if (typeof content !== "string" || typeof meta !== "string") {
    throw new Error("Model response JSON is missing content_md or meta_description.");
  }

  const replaceEmDashes = (value: string) => value.replace(/[ \t]*\u2014[ \t]*/g, ": ");
  const contentClean = replaceEmDashes(content.trim());
  const metaClean = replaceEmDashes(meta).replace(/\s+/g, " ").trim();

  if (!contentClean || !metaClean) {
    throw new Error("Model response contained empty content or meta description.");
  }

  return { content_md: contentClean, meta_description: metaClean };
}

async function requestCopyCompletion(prompt: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    max_tokens: 500,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }]
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

async function generateCopy(gameName: string, notes: string): Promise<GenerateCopyResult> {
  const prompt = `
You are writing a short intro for an events page for the Roblox game "${gameName}".

Use only the research notes provided. Do not invent facts. If something is not mentioned, leave it out.

Write in simple, natural English like a real ${gameName} player explaining things to another player. Make it easier for everyone to understand and follow through.
Include only the needed info for a page "When is the next ${gameName} event". Do not include any clutter we do no need. 

Do not start with:

 - “${gameName} is…”
 - “Events in ${gameName}…”
 - “This page…”

Jump straight into real gameplay or event-related context. Include what are events are in the game, when they happen, how often, etc, only if the details are available in the source.

Keep the flow story-like and human. Start with something that is very unqiue to the game. 

Do not claim that events give skill boosts, ranking advantages, or better rewards unless the notes clearly say that.

Write 1 to 2 short paragraphs, around 90 to 120 words total. But keep things detailed, informative and include details users need to know. 

Return ONLY JSON with:

 - content_md: the intro in Markdown, starting directly with in-game context and naturally leading into a line like “Here are the upcoming events for ${gameName}.”
 - meta_description: 140–170 characters, one sentence, mention upcoming events, start dates and times, countdown timers, and the game name. No hype words.

Research notes:
${notes || "No research notes available."}
`.trim();

  const raw = await requestCopyCompletion(prompt);
  return parseCopyJson(raw);
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in environment.");
  }

  const args = parseArgs();
  const sb = supabaseAdmin();
  let universeId: number | null = args.universeId;
  let existingPage: EventsPageRow | null = null;

  if (args.slug) {
    const slugLookup = slugify(args.slug);
    const slugQuery = slugLookup || args.slug;
    existingPage = await fetchPageBySlug(slugQuery);
    universeId = existingPage?.universe_id ?? null;

    if (!universeId) {
      const universe = await fetchUniverseBySlug(slugQuery);
      universeId = universe?.universe_id ?? null;
    }
  }

  if (!universeId) {
    const universeIds = await fetchUniverseIds();
    if (!universeIds.length) {
      console.log("No universe IDs found in roblox_virtual_events.");
      return;
    }

    const existingMap = await fetchExistingPages(universeIds);
    const targetId = universeIds.find((id) => {
      const page = existingMap.get(id);
      const content = normalizeText(page?.content_md);
      const meta = normalizeText(page?.meta_description);
      return !page || !content || !meta;
    });

    if (!targetId) {
      console.log("All events pages already have content and meta descriptions. Provide --slug or --universe-id to regenerate.");
      return;
    }

    universeId = targetId;
    existingPage = existingMap.get(targetId) ?? null;
  } else if (!existingPage) {
    existingPage = await fetchPageByUniverseId(universeId);
  }

  if (!universeId) {
    throw new Error("Unable to resolve a universe to process.");
  }

  await ensureUniverseHasEvents(universeId);

  const universeMap = await fetchUniverses([universeId]);
  const universe = universeMap.get(universeId);
  if (!universe) {
    throw new Error(`Universe ${universeId} not found.`);
  }

  const displayName =
    normalizeText(universe.display_name) ?? normalizeText(universe.name) ?? `Universe ${universeId}`;

  const existingContent = normalizeText(existingPage?.content_md);
  const existingMeta = normalizeText(existingPage?.meta_description);

  if (!args.force && existingContent && existingMeta) {
    console.log(`Events page already has content and meta description for universe ${universeId}. Use --force to regenerate.`);
    return;
  }

  const slug = normalizeText(existingPage?.slug) ?? (await ensureUniqueSlug(slugify(displayName), universeId));
  console.log(`Generating events page copy for "${displayName}" (universe ${universeId})...`);

  const notes = await buildResearchNotes(displayName);
  const copy = await generateCopy(displayName, notes);

  if (existingPage) {
    const updatePayload: Partial<EventsPageRow> = {
      content_md: copy.content_md,
      meta_description: copy.meta_description
    };
    if (!normalizeText(existingPage.slug)) {
      updatePayload.slug = slug;
    }
    if (existingPage.is_published === null || typeof existingPage.is_published === "undefined") {
      updatePayload.is_published = DEFAULT_PUBLISHED;
    }

    const { error } = await sb.from("events_pages").update(updatePayload).eq("universe_id", universeId);
    if (error) {
      throw new Error(`Failed to update events page: ${error.message}`);
    }
  } else {
    const { error } = await sb.from("events_pages").insert({
      universe_id: universeId,
      slug,
      title: "",
      content_md: copy.content_md,
      meta_description: copy.meta_description,
      is_published: DEFAULT_PUBLISHED
    });

    if (error) {
      throw new Error(`Failed to insert events page: ${error.message}`);
    }
  }

  await revalidateEventSlugs([slug]);
  console.log(`Events page updated for universe ${universeId}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
