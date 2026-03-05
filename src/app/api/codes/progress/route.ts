import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session-user";
import { isTrustedMutationOrigin } from "@/lib/security/request";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MAX_USED_CODES = 1000;

function normalizeSlug(value: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return "";
  return trimmed;
}

function normalizeUsedCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const result: string[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= MAX_USED_CODES) break;
  }

  return result;
}

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const slug = normalizeSlug(new URL(request.url).searchParams.get("slug"));
    if (!slug) {
      return NextResponse.json({ error: "Game slug is required." }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("user_code_progress")
      .select("used_code_ids")
      .eq("user_id", user.id)
      .eq("game_slug", slug)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Unable to load code progress." }, { status: 500 });
    }

    const usedCodes = normalizeUsedCodes((data as { used_code_ids?: unknown } | null)?.used_code_ids);
    return NextResponse.json(
      { usedCodes },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("Failed to load code progress", error);
    return NextResponse.json({ error: "Unable to load code progress." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!isTrustedMutationOrigin(request)) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }

    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const slug = normalizeSlug(payload?.slug ?? null);
    const usedCodes = normalizeUsedCodes(payload?.usedCodes);

    if (!slug) {
      return NextResponse.json({ error: "Game slug is required." }, { status: 400 });
    }

    const admin = supabaseAdmin();

    if (usedCodes.length === 0) {
      const { error } = await admin
        .from("user_code_progress")
        .delete()
        .eq("user_id", user.id)
        .eq("game_slug", slug);

      if (error) {
        return NextResponse.json({ error: "Unable to clear code progress." }, { status: 500 });
      }

      return NextResponse.json({ usedCodes: [] });
    }

    const { error } = await admin
      .from("user_code_progress")
      .upsert(
        {
          user_id: user.id,
          game_slug: slug,
          used_code_ids: usedCodes
        },
        { onConflict: "user_id,game_slug" }
      );

    if (error) {
      return NextResponse.json({ error: "Unable to save code progress." }, { status: 500 });
    }

    return NextResponse.json({ usedCodes });
  } catch (error) {
    console.error("Failed to save code progress", error);
    return NextResponse.json({ error: "Unable to save code progress." }, { status: 500 });
  }
}
