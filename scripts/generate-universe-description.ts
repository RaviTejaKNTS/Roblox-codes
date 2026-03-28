import "dotenv/config";

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { tavilySearch } from "./lib/tavily";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

const TAVILY_API_KEY = process.env.TAVILY_API_KEY!;

type UniverseRow = {
  universe_id: number;
  slug: string;
  name: string | null;
  display_name: string | null;
  game_description_md: string | null;
  updated_at?: string | null;
  playing?: number | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildResearchNotes(gameName: string): Promise<string> {
  const search = await tavilySearch(`${gameName} Roblox gameplay progression mechanics`, {
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
Topic: "${gameName}"
Use only the supplied Tavily research context.
Provide concise, bullet-style research notes about this Roblox experience. Focus on:
- What players do (core loop / objective)
- How progression works or how players earn rewards
- Key mechanics or unique systems
Only include facts you are confident about. If unsure, omit it. No links.

Research context:
${context}
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    max_tokens: 800,
    messages: [
      { role: "system", content: "Return concise research notes. No links. Use only the supplied Tavily research context." },
      { role: "user", content: prompt }
    ]
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

async function pickUniverse(input?: string | null): Promise<UniverseRow | null> {
  const baseSelect = "universe_id,slug,name,display_name,game_description_md,updated_at,playing";

  // If an explicit identifier is provided, resolve it directly.
  if (input) {
    const orFilters = [`slug.eq.${input}`, `name.eq.${input}`, `display_name.eq.${input}`];
    const numericId = Number(input);
    const baseQuery = supabase.from("roblox_universes").select(baseSelect).limit(1);
    const query = Number.isFinite(numericId)
      ? baseQuery.or(orFilters.join(",")).eq("universe_id", numericId)
      : baseQuery.or(orFilters.join(","));

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return (data as UniverseRow | null) ?? null;
  }

  // Otherwise, pick the oldest-updated universe missing a description.
  const { data, error } = await supabase
    .from("roblox_universes")
    .select(baseSelect)
    .or("game_description_md.is.null,game_description_md.eq.")
    .not("playing", "is", null)
    .order("playing", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as UniverseRow | null) ?? null;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function endsWithSentence(text: string): boolean {
  return /[.!?]\s*$/.test(text.trim());
}

async function buildDescription(gameName: string, sources: string): Promise<string> {
  const prompt = `
You are a Roblox games writer. Using only the facts from the sources below, write a concise 60–90 word paragraph that:
- Introduces what game is all about.
- Explains the core loop/objective and how to play (what to do, how to progress).
- Avoids speculation, filler, or unnecessary details.
- Uses plain text (no links, no placeholders, no code fences, no backticks) and one paragraph only.
- No generic sentences like "this is a fun game" or "this is a great game". Write something that is specific to the game and more detailed.
- Write in simple english and easy to understand style that everyone can easily understand. Talk like a friend talking to another friend.
- Write full sentences that feel complete and make sure every sentence adds value to the user.
- Do not start with generic sentences like "{game name} is a roblox game" or "this is a roblox game" or "In this game". Start with something hooking and unconventional. Always start with something that is unique and engaging. Don't repeat the same thing over and over again.
- Keep the writing engaging so the user gets a clear idea of what the game is about and how to play it.
- Still keep the tone professional enough to be a Roblox games writer.
- Complete the entire description. Do not leave in the middle of a sentence at the end.
- Do not use em-dashes.
- Return only the paragraph (no extra formatting, no code fences, no backticks).
- Ensure the paragraph ends with a complete sentence (no cut-off ending).

Sources:
${sources}
`;

  const attempt = async (extraInstruction?: string) => {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        { role: "user", content: extraInstruction ? `${prompt}\n\n${extraInstruction}` : prompt }
      ]
    });
    return completion.choices[0]?.message?.content?.trim() ?? "";
  };

  let raw = await attempt();
  const wordCount = countWords(raw);
  const okLength = wordCount >= 60 && wordCount <= 90;
  const okEnding = endsWithSentence(raw);

  if (!okLength || !okEnding) {
    raw = await attempt(
      "Rewrite to exactly one paragraph of 60–90 words and ensure it ends with a complete sentence. No cut-off endings."
    );
  }

  return raw.trim();
}

async function main() {
  const input = process.argv[2];

  if (!TAVILY_API_KEY) {
    throw new Error("Missing TAVILY_API_KEY in environment.");
  }

  const universe = await pickUniverse(input);
  if (!universe) {
    if (input) {
      console.error(`❌ Universe not found for "${input}".`);
    } else {
      console.error("❌ No universe available without a description. All caught up!");
    }
    process.exit(1);
  }

  const gameName = universe.display_name || universe.name || `Universe ${universe.universe_id}`;
  console.log(`🔍 Gathering context for "${gameName}" (${universe.slug})...`);

  console.log("🛰️  Gathering Tavily research notes...");
  const notes = await buildResearchNotes(gameName);
  const sourceWords = notes.trim().split(/\s+/).filter(Boolean);
  if (sourceWords.length < 20) {
    console.error("⚠️ Research returned too little information to safely summarize. Aborting.");
    process.exit(1);
  }
  const sources = `Research notes:\n${notes}`;
  await sleep(200);

  console.log("🧠 Generating description...");
  const description = await buildDescription(gameName, sources);

  const descWords = description.trim().split(/\s+/).filter(Boolean);
  const badPatterns = [/couldn['’]t find/i, /could not find/i, /no information/i, /please share more details/i];
  const looksBad =
    badPatterns.some((re) => re.test(description)) ||
    descWords.length < 60 ||
    descWords.length > 90 ||
    !/[.!?]\s*$/.test(description.trim());
  if (looksBad) {
    console.error("❌ Generated description looks invalid (too short or fallback/apology text). Not updating.");
    process.exit(1);
  }

  const { error } = await supabase
    .from("roblox_universes")
    .update({ game_description_md: description })
    .eq("universe_id", universe.universe_id);

  if (error) {
    console.error("❌ Failed to update universe:", error.message);
    process.exit(1);
  }

  console.log(`✅ Updated ${gameName} (universe_id=${universe.universe_id}) with description:\n${description}`);
}

main().catch((error) => {
  console.error("❌ Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
