import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function authOK(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  return token && token === process.env.ADMIN_TOKEN;
}

export async function GET(req: NextRequest) {
  if (!authOK(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("authors").select("*").order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  if (!authOK(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body?.name || !body?.slug) {
    return NextResponse.json({ error: "name and slug required" }, { status: 400 });
  }
  const sb = supabaseAdmin();
  const payload = {
    id: body.id || undefined,
    name: body.name,
    slug: body.slug,
    gravatar_email: body.gravatar_email || null,
    avatar_url: body.avatar_url || null,
    bio_md: body.bio_md || null,
    twitter: body.twitter || null,
    youtube: body.youtube || null,
    website: body.website || null,
  };
  const { data, error } = await sb
    .from("authors")
    .upsert(payload, { onConflict: "slug" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  if (!authOK(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req
    .json()
    .catch(() => null) as { id?: string; slug?: string } | null;

  const identifier = body?.id ? { key: "id", value: body.id } : body?.slug ? { key: "slug", value: body.slug } : null;

  if (!identifier) {
    return NextResponse.json({ error: "id or slug required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const query = sb.from("authors").delete().eq(identifier.key, identifier.value).select("*").maybeSingle();
  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "author not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deleted: data });
}
