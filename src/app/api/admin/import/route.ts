import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { scrapeRobloxdenPage } from "@/lib/robloxden";
import { extractRewardItems } from "@/lib/rewards";

type ImportPayload = {
  sourceUrl: string;
  name?: string;
  slug?: string;
  publish?: boolean;
};

function authOK(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  return token && token === process.env.ADMIN_TOKEN;
}

function slugFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.pop() || null;
  } catch {
    return null;
  }
}

function titleCase(slug: string): string {
  return slug
    .replace(/[-_]/g, " ")
    .replace(/\w/g, (c) => c.toUpperCase());
}

function normalizeEntry(entry: unknown): ImportPayload {
  if (typeof entry === "string") {
    return { sourceUrl: entry };
  }
  if (entry && typeof entry === "object" && "sourceUrl" in entry) {
    const value = entry as Record<string, unknown>;
    if (typeof value.sourceUrl === "string") {
      const payload: ImportPayload = {
        sourceUrl: value.sourceUrl,
      };
      if (typeof value.name === "string") payload.name = value.name;
      if (typeof value.slug === "string") payload.slug = value.slug;
      if (typeof value.publish === "boolean") payload.publish = value.publish;
      return payload;
    }
  }
  throw new Error("sourceUrl required");
}

async function importSingle(sb: ReturnType<typeof supabaseAdmin>, payload: ImportPayload) {
  const { sourceUrl, name, slug, publish } = payload;
  if (!sourceUrl) throw new Error("sourceUrl required");

  const derivedSlug = slug ?? slugFromUrl(sourceUrl);
  if (!derivedSlug) throw new Error("could not derive slug from URL");

  const derivedName = name ?? titleCase(derivedSlug);
  const publishFlag = publish ?? true;

  const { data: game, error: upsertError } = await sb
    .from("games")
    .upsert(
      {
        name: derivedName,
        slug: derivedSlug,
        source_url: sourceUrl,
        is_published: publishFlag,
      },
      { onConflict: "slug" }
    )
    .select("*")
    .single();

  if (upsertError || !game) {
    throw new Error(upsertError?.message ?? "upsert failed");
  }

  const scraped = await scrapeRobloxdenPage(sourceUrl);
  let upserted = 0;
  const rewardMap = new Map<string, string>();

  for (const c of scraped) {
    const { error: rpcError } = await sb.rpc("upsert_code", {
      p_game_id: game.id,
      p_code: c.code,
      p_status: c.status,
      p_rewards_text: c.rewardsText ?? null,
      p_level_requirement: c.levelRequirement ?? null,
      p_is_new: c.isNew ?? false,
    });

    if (rpcError) {
      throw new Error(`upsert failed for ${c.code}: ${rpcError.message}`);
    }

    const items = extractRewardItems(c.rewardsText);
    for (const item of items) {
      const key = item.toLowerCase();
      if (!rewardMap.has(key)) rewardMap.set(key, item);
    }

    upserted += 1;
  }

  const rewards = Array.from(rewardMap.values());
  await sb
    .from("games")
    .update({
      reward_1: rewards[0] ?? null,
      reward_2: rewards[1] ?? null,
      reward_3: rewards[2] ?? null,
    })
    .eq("id", game.id);

  return { game, codesFound: scraped.length, codesUpserted: upserted, rewardsStored: rewards.slice(0, 3) };
}

export async function POST(req: NextRequest) {
  if (!authOK(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const sb = supabaseAdmin();

  const rawSources = Array.isArray(body?.sources)
    ? body.sources
    : Array.isArray(body)
      ? body
      : null;

  if (rawSources) {
    const results: Array<{ ok: boolean; sourceUrl: string | null; error?: string; game?: any; codesFound?: number; codesUpserted?: number }> = [];

    for (const entry of rawSources) {
      let normalized: ImportPayload;
      try {
        normalized = normalizeEntry(entry);
      } catch (err: any) {
        results.push({ ok: false, sourceUrl: null, error: err?.message ?? "invalid payload" });
        continue;
      }

      try {
        const result = await importSingle(sb, normalized);
        results.push({ ok: true, sourceUrl: normalized.sourceUrl, ...result });
      } catch (err: any) {
        results.push({ ok: false, sourceUrl: normalized.sourceUrl, error: err?.message ?? "import failed" });
      }
    }

    const success = results.some((r) => r.ok);
    return NextResponse.json({ ok: success, results });
  }

  try {
    const normalized = normalizeEntry(body);
    const result = await importSingle(sb, normalized);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    const message = err?.message ?? "import failed";
    const isBadRequest = message.includes("sourceUrl") || message.includes("derive slug");
    return NextResponse.json({ error: message }, { status: isBadRequest ? 400 : 500 });
  }
}
