import "dotenv/config";

import OpenAI from "openai";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { revalidateEventsByUniverseIds } from "./lib/revalidate-events";
import { tavilySearch } from "./lib/tavily";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!TAVILY_API_KEY) {
  throw new Error("Missing TAVILY_API_KEY.");
}

if (!OPENAI_KEY) {
  throw new Error("Missing OPENAI_API_KEY.");
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE.");
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

const PAGE_BATCH = Number(process.env.EVENT_DETAILS_PAGE_BATCH ?? "1000");
const EVENT_BATCH = Number(process.env.EVENT_DETAILS_EVENT_BATCH ?? "200");
type EventRow = {
  event_id: string;
  universe_id: number | null;
  title: string | null;
  display_title: string | null;
  start_utc: string | null;
  end_utc: string | null;
  event_status: string | null;
  event_summary_md: string | null;
  event_details_md: string | null;
};

type UniverseRow = {
  universe_id: number;
  display_name: string | null;
  name: string | null;
};

type GenerateCopyResult = {
  event_summary_md: string;
  event_details_md: string;
};

type ScriptArgs = {
  eventId: string | null;
  force: boolean;
  all: boolean;
};

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isEmpty(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

function getEventDisplayName(event: EventRow): string {
  return normalizeText(event.display_title) ?? normalizeText(event.title) ?? "Upcoming event";
}

function parseArgs(): ScriptArgs {
  const args = process.argv.slice(2);
  let eventId: string | null = null;
  let force = false;
  let all = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--all") {
      all = true;
      continue;
    }
    if (arg === "--event-id") {
      eventId = args[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg.startsWith("--event-id=")) {
      eventId = arg.slice("--event-id=".length) || null;
      continue;
    }
    if (!eventId) {
      eventId = arg;
    }
  }

  return {
    eventId: normalizeText(eventId),
    force,
    all
  };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function parseDate(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function formatStartTimeForPrompt(startUtc: string | null): string | null {
  if (!startUtc) return null;
  const parsed = Date.parse(startUtc);
  if (Number.isNaN(parsed)) return null;
  const date = new Date(parsed);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
  return `${dateLabel} at ${timeLabel} PT`;
}

async function fetchEventPagesUniverseIds(): Promise<number[]> {
  const sb = supabaseAdmin();
  const ids = new Set<number>();
  let offset = 0;

  while (true) {
    const { data, error } = await sb
      .from("events_pages")
      .select("universe_id")
      .order("universe_id", { ascending: true })
      .range(offset, offset + PAGE_BATCH - 1);

    if (error) {
      throw new Error(`Failed to load events pages: ${error.message}`);
    }

    const rows = (data ?? []) as Array<{ universe_id?: number | null }>;
    for (const row of rows) {
      if (typeof row.universe_id === "number") {
        ids.add(row.universe_id);
      }
    }

    if (rows.length < PAGE_BATCH) break;
    offset += rows.length;
  }

  return Array.from(ids.values());
}

async function fetchEventById(eventId: string): Promise<EventRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("roblox_virtual_events")
    .select(
      "event_id, universe_id, title, display_title, start_utc, end_utc, event_status, event_summary_md, event_details_md"
    )
    .eq("event_id", eventId)
    .limit(1);

  if (error) {
    throw new Error(`Failed to load event ${eventId}: ${error.message}`);
  }

  return ((data ?? [])[0] as EventRow | undefined) ?? null;
}

async function fetchUpcomingEvents(universeIds: number[], nowIso: string, force: boolean): Promise<EventRow[]> {
  if (!universeIds.length) return [];
  const sb = supabaseAdmin();
  let query = sb
    .from("roblox_virtual_events")
    .select(
      "event_id, universe_id, title, display_title, start_utc, end_utc, event_status, event_summary_md, event_details_md"
    )
    .in("universe_id", universeIds)
    .gt("start_utc", nowIso)
    .order("start_utc", { ascending: true });

  if (!force) {
    query = query.or("event_summary_md.is.null,event_summary_md.eq.,event_details_md.is.null,event_details_md.eq.");
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load upcoming events: ${error.message}`);
  }

  return (data ?? []) as EventRow[];
}

async function fetchUpcomingEventsForUniverses(
  universeIds: number[],
  nowIso: string,
  force: boolean
): Promise<EventRow[]> {
  const events: EventRow[] = [];
  for (const chunk of chunkArray(universeIds, EVENT_BATCH)) {
    const batch = await fetchUpcomingEvents(chunk, nowIso, force);
    events.push(...batch);
  }
  return events;
}

async function fetchUniverseById(universeId: number): Promise<UniverseRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("roblox_universes")
    .select("universe_id, display_name, name")
    .eq("universe_id", universeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load universe ${universeId}: ${error.message}`);
  }

  return (data as UniverseRow | null) ?? null;
}

async function pickNextEvent(force: boolean): Promise<EventRow | null> {
  const universeIds = await fetchEventPagesUniverseIds();
  if (!universeIds.length) return null;

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  let candidate: EventRow | null = null;
  let candidateStart = Number.POSITIVE_INFINITY;

  for (const chunk of chunkArray(universeIds, EVENT_BATCH)) {
    const events = await fetchUpcomingEvents(chunk, nowIso, force);
    for (const event of events) {
      const status = event.event_status?.toLowerCase() ?? "";
      if (status === "ended" || status === "cancelled") continue;

      const needsSummary = force || isEmpty(event.event_summary_md);
      const needsDetails = force || isEmpty(event.event_details_md);
      if (!needsSummary && !needsDetails) continue;

      const startTime = parseDate(event.start_utc);
      if (!startTime || startTime <= now) continue;

      if (startTime < candidateStart) {
        candidateStart = startTime;
        candidate = event;
      }
    }
  }

  return candidate;
}

async function buildResearchNotes(gameName: string, eventName: string, startLabel: string): Promise<string> {
  const search = await tavilySearch(`${eventName} ${gameName} Roblox event`, {
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
Give me complete details about the upcoming ${gameName} ${eventName} event that will start on ${startLabel}.

Use only the supplied Tavily research context.
Cover the full end-to-end details of what we know about this event and what players can expect from this upcoming event.
Include only information specific to this exact event in this game. Avoid generic details like times, developer name where people can access it, how to join. 
Instead focus on the game specific and event specific details. What a Roblox player should know have to covered clearly.
Avoid dates, times, countdowns, and schedules.
Return concise research notes. Do not include URLs.

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

function parseCopyJson(raw: string, eventName: string): GenerateCopyResult {
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

  const summary = (parsed as { event_summary_md?: unknown }).event_summary_md;
  const details = (parsed as { event_details_md?: unknown }).event_details_md;

  if (typeof summary !== "string" || typeof details !== "string") {
    throw new Error("Model response JSON is missing event_summary_md or event_details_md.");
  }

  const replaceEmDashes = (value: string) => value.replace(/[ \t]*\u2014[ \t]*/g, ": ");
  const summaryClean = replaceEmDashes(summary.trim());
  let detailsClean = replaceEmDashes(details.trim()).replace(/\n{3,}/g, "\n\n");

  const heading = `## What to expect from ${eventName}`;
  if (!detailsClean.startsWith(heading)) {
    detailsClean = detailsClean.replace(/^#+\s.*\n+/, "").trim();
    detailsClean = `${heading}\n\n${detailsClean}`;
  }

  if (!summaryClean || !detailsClean || detailsClean === heading) {
    throw new Error("Model response contained empty summary or details.");
  }

  return { event_summary_md: summaryClean, event_details_md: detailsClean };
}

async function generateEventCopy(gameName: string, eventName: string, notes: string): Promise<GenerateCopyResult> {
  const prompt = `
You are writing copy for an upcoming Roblox event.

Game: "${gameName}"
Event: "${eventName}"

Use only the research notes below. Do not invent facts. If something is not mentioned, leave it out.
Write only about this specific event. Do not include general game info or other events. Do not include dates of events, generic game or Roblox info. Be focused on specific event and clearly write that helps Roblox players know what they can expect from this event.
We are talking about an upcoming event, so talk as we can expect these from the event rather than than being confident in the claims. Give the required info but warn users that the actual details will be available once the event is live.

Return ONLY JSON with:
- event_summary_md: 1-2 short sentences, no headings, simple English. Explain what the event is and keep it event-specific.
- event_details_md: Include all known details about this event only. Do not mention any sources. Write clearly and keep it focused on the event. You may use paragraphs, tables, or bullet points if they help.

Research notes:
${notes || "No research notes available."}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    max_tokens: 700,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }]
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  return parseCopyJson(raw, eventName);
}

async function main() {
  const args = parseArgs();
  const sb = supabaseAdmin();

  let event = args.eventId ? await fetchEventById(args.eventId) : null;

  if (!event) {
    if (args.eventId) {
      console.error(`No event found for event_id ${args.eventId}.`);
      return;
    }
    if (args.all) {
      const universeIds = await fetchEventPagesUniverseIds();
      if (!universeIds.length) {
        console.log("No universe IDs found in events_pages.");
        return;
      }

      const nowIso = new Date().toISOString();
      const events = await fetchUpcomingEventsForUniverses(universeIds, nowIso, args.force);
      if (!events.length) {
        console.log("No upcoming events found that need event summary/details.");
        return;
      }

      const universeCache = new Map<number, UniverseRow | null>();
      const updatedUniverses = new Set<number>();
      const stats = {
        total: events.length,
        skippedMissingUniverse: 0,
        skippedMissingStart: 0,
        skippedStatus: 0,
        skippedNoChanges: 0,
        updated: 0,
        failed: 0
      };

      for (const entry of events) {
        if (!entry.universe_id) {
          stats.skippedMissingUniverse += 1;
          continue;
        }

        const status = entry.event_status?.toLowerCase() ?? "";
        if (status === "ended" || status === "cancelled") {
          stats.skippedStatus += 1;
          continue;
        }

        const needsSummary = args.force || isEmpty(entry.event_summary_md);
        const needsDetails = args.force || isEmpty(entry.event_details_md);
        if (!needsSummary && !needsDetails) {
          stats.skippedNoChanges += 1;
          continue;
        }

        const startLabel = formatStartTimeForPrompt(entry.start_utc);
        if (!startLabel) {
          stats.skippedMissingStart += 1;
          continue;
        }

        let universe = universeCache.get(entry.universe_id) ?? null;
        if (!universeCache.has(entry.universe_id)) {
          universe = await fetchUniverseById(entry.universe_id);
          universeCache.set(entry.universe_id, universe);
        }
        const gameName = universe?.display_name ?? universe?.name ?? `Universe ${entry.universe_id}`;
        const eventName = getEventDisplayName(entry);

        try {
          console.log(`Generating event copy for "${eventName}" (${gameName})...`);
          const notes = await buildResearchNotes(gameName, eventName, startLabel);
          if (!notes.trim()) {
            console.error(`No research notes returned for event ${entry.event_id}. Skipping.`);
            stats.failed += 1;
            continue;
          }

          const copy = await generateEventCopy(gameName, eventName, notes);
          const update: Partial<Pick<EventRow, "event_summary_md" | "event_details_md">> = {};

          if (needsSummary) {
            update.event_summary_md = copy.event_summary_md;
          }
          if (needsDetails) {
            update.event_details_md = copy.event_details_md;
          }

          if (!Object.keys(update).length) {
            stats.skippedNoChanges += 1;
            continue;
          }

          const { error } = await sb.from("roblox_virtual_events").update(update).eq("event_id", entry.event_id);
          if (error) {
            throw new Error(`Failed to update event ${entry.event_id}: ${error.message}`);
          }

          updatedUniverses.add(entry.universe_id);
          stats.updated += 1;
        } catch (error) {
          stats.failed += 1;
          console.error(`Event ${entry.event_id} failed:`, (error as Error).message);
        }
      }

      if (updatedUniverses.size) {
        await revalidateEventsByUniverseIds(Array.from(updatedUniverses));
      }

      console.log(`Event details refresh complete. stats=${JSON.stringify(stats)}`);
      return;
    }

    event = await pickNextEvent(args.force);
  }

  if (!event) {
    console.log("No upcoming events found that need event summary/details.");
    return;
  }

  const universeId = event.universe_id;
  if (!universeId) {
    throw new Error(`Event ${event.event_id} is missing universe_id.`);
  }

  const universe = await fetchUniverseById(universeId);
  const gameName = universe?.display_name ?? universe?.name ?? `Universe ${universeId}`;
  const eventName = getEventDisplayName(event);

  const needsSummary = args.force || isEmpty(event.event_summary_md);
  const needsDetails = args.force || isEmpty(event.event_details_md);
  if (!needsSummary && !needsDetails) {
    console.log(`Event ${event.event_id} already has summary and details.`);
    return;
  }

  console.log(`Generating event copy for "${eventName}" (${gameName})...`);

  const startLabel = formatStartTimeForPrompt(event.start_utc);
  if (!startLabel) {
    throw new Error(`Event ${event.event_id} is missing a valid start_utc for the research prompt.`);
  }

  const notes = await buildResearchNotes(gameName, eventName, startLabel);
  if (!notes.trim()) {
    console.error("No research notes returned from Tavily/OpenAI. Skipping.");
    return;
  }

  const copy = await generateEventCopy(gameName, eventName, notes);
  const update: Partial<Pick<EventRow, "event_summary_md" | "event_details_md">> = {};

  if (needsSummary) {
    update.event_summary_md = copy.event_summary_md;
  }
  if (needsDetails) {
    update.event_details_md = copy.event_details_md;
  }

  if (!Object.keys(update).length) {
    console.log("Nothing to update.");
    return;
  }

  const { error } = await sb.from("roblox_virtual_events").update(update).eq("event_id", event.event_id);
  if (error) {
    throw new Error(`Failed to update event ${event.event_id}: ${error.message}`);
  }

  await revalidateEventsByUniverseIds([universeId]);
  console.log(`Updated event ${event.event_id}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
