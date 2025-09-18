import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { scrapeRobloxdenPage } from "@/lib/robloxden";

function authOK(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  return token && token === process.env.ADMIN_TOKEN;
}

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  if (!authOK(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  const { data: game, error } = await sb.from("games").select("*").eq("id", params.id).single();
  if (error || !game) return NextResponse.json({ error: error?.message || "game not found" }, { status: 404 });
  if (!game.source_url) return NextResponse.json({ error: "game.source_url missing" }, { status: 400 });

  const scraped = await scrapeRobloxdenPage(game.source_url);

  // Upsert all codes
  for (const c of scraped) {
    await sb.rpc("upsert_code", {
      p_game_id: game.id,
      p_code: c.code,
      p_status: c.status,
      p_rewards_text: c.rewardsText || null,
      p_level_requirement: c.levelRequirement,
      p_is_new: c.isNew || false
    });
  }

  return NextResponse.json({ ok: true, count: scraped.length });
}
