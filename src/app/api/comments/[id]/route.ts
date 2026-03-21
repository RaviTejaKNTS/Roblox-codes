import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth/session-user";
import { supabaseAdmin } from "@/lib/supabase";
import { moderateCommentBody } from "@/lib/comment-moderation";
import { getCommentsTag, toCommentEntry, type CommentRow } from "@/lib/comments";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getRequestIp, isTrustedMutationOrigin } from "@/lib/security/request";

export const dynamic = "force-dynamic";

const MAX_BODY_LENGTH = 1000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMENT_EDIT_RATE_LIMIT = {
  limit: 30,
  windowMs: 10 * 60 * 1000
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!isTrustedMutationOrigin(request)) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }

    const ip = getRequestIp(request);
    const rateLimit = checkRateLimit({
      key: `comments:patch:${ip}`,
      ...COMMENT_EDIT_RATE_LIMIT
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many edit attempts. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
        }
      );
    }

    const { id: rawId } = await context.params;
    const id = normalizeString(rawId);
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid comment id." }, { status: 400 });
    }

    const payload = await request.json();
    const body = normalizeString(payload?.body);
    if (!body) {
      return NextResponse.json({ error: "Comment cannot be empty." }, { status: 400 });
    }
    if (body.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: `Comments must be ${MAX_BODY_LENGTH} characters or less.` }, { status: 400 });
    }

    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "You must be logged in to edit comments." }, { status: 401 });
    }

    const admin = supabaseAdmin();
    const { data: existingRow } = await admin
      .from("comments")
      .select("id, entity_type, entity_id")
      .eq("id", id)
      .eq("author_id", sessionUser.id)
      .maybeSingle();

    if (!existingRow) {
      return NextResponse.json({ error: "Unable to update comment." }, { status: 403 });
    }

    const moderationDecision = await moderateCommentBody(body);
    if (!moderationDecision.approved) {
      return NextResponse.json({ error: "Comment update did not pass moderation." }, { status: 400 });
    }

    const { data: updatedRow, error: updateError } = await admin
      .from("comments")
      .update({
        body_md: body,
        status: "approved",
        moderation: moderationDecision.moderation
      })
      .eq("id", id)
      .eq("author_id", sessionUser.id)
      .select("id, entity_type, entity_id")
      .maybeSingle();

    if (updateError || !updatedRow) {
      return NextResponse.json({ error: "Unable to update comment." }, { status: 403 });
    }

    const { data: commentRow, error: commentError } = await admin
      .from("comments")
      .select(
        "id, parent_id, body_md, status, created_at, author_id, guest_name, author:app_users(display_name, roblox_avatar_url, roblox_display_name, roblox_username, role)"
      )
      .eq("id", id)
      .maybeSingle();

    if (commentError || !commentRow) {
      return NextResponse.json({ error: "Unable to load comment." }, { status: 500 });
    }

    const normalizedRow = {
      ...commentRow,
      author: Array.isArray(commentRow.author) ? (commentRow.author[0] ?? null) : (commentRow.author ?? null)
    } as unknown as CommentRow;

    const comment = await toCommentEntry(normalizedRow);

    revalidateTag(getCommentsTag(updatedRow.entity_type, updatedRow.entity_id), { expire: 0 });

    return NextResponse.json({ comment });
  } catch (error) {
    console.error("Unhandled comment update error", error);
    return NextResponse.json({ error: "Unable to update comment." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!isTrustedMutationOrigin(request)) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }

    const ip = getRequestIp(request);
    const rateLimit = checkRateLimit({
      key: `comments:delete:${ip}`,
      ...COMMENT_EDIT_RATE_LIMIT
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many delete attempts. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
        }
      );
    }

    const { id: rawId } = await context.params;
    const id = normalizeString(rawId);
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid comment id." }, { status: 400 });
    }

    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "You must be logged in to delete comments." }, { status: 401 });
    }

    const admin = supabaseAdmin();
    const { data: commentRow } = await admin
      .from("comments")
      .select("id, entity_type, entity_id, status")
      .eq("id", id)
      .eq("author_id", sessionUser.id)
      .maybeSingle();

    if (!commentRow) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }

    const { error: deleteError } = await admin
      .from("comments")
      .delete()
      .eq("id", id)
      .eq("author_id", sessionUser.id);
    if (deleteError) {
      return NextResponse.json({ error: "Unable to delete comment." }, { status: 500 });
    }

    revalidateTag(getCommentsTag(commentRow.entity_type, commentRow.entity_id), { expire: 0 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unhandled comment delete error", error);
    return NextResponse.json({ error: "Unable to delete comment." }, { status: 500 });
  }
}
