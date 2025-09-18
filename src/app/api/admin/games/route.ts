import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { DEFAULT_AUTHOR_ID } from "@/lib/constants";

function authOK(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  return token && token === process.env.ADMIN_TOKEN;
}

export async function GET(req: NextRequest) {
  if (!authOK(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("games").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  if (!authOK(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("games").upsert({
    name: body.name,
    slug: body.slug,
    author_id: body.author_id || DEFAULT_AUTHOR_ID || null,
    source_url: body.source_url || null,
    cover_image: body.cover_image || null,
    seo_title: body.seo_title || null,
    seo_description: body.seo_description || null,
    seo_keywords: body.seo_keywords || null,
    intro_md: body.intro_md || null,
    redeem_md: body.redeem_md || null,
    description_md: body.description_md || null,
    is_published: !!body.is_published
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
