import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { scrapeRobloxdenPage } from "@/lib/robloxden";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data: games, error } = await sb.from("games").select("*").eq("is_published", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let total = 0;
  for (const g of games) {
    if (!g.source_url) continue;
    try {
      const scraped = await scrapeRobloxdenPage(g.source_url);
      for (const c of scraped) {
        await sb.rpc("upsert_code", {
          p_game_id: g.id,
          p_code: c.code,
          p_status: c.status,
          p_rewards_text: c.rewardsText || null,
          p_level_requirement: c.levelRequirement,
          p_is_new: c.isNew || false
        });
      }
      total += scraped.length;
    } catch (e:any) {
      console.error("Scrape failed:", g.slug, e?.message);
    }
  }

  return NextResponse.json({ ok: true, total });
}
