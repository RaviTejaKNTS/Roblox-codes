import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth/session-user";
import { supabaseAdmin } from "@/lib/supabase";
import { moderateCommentBody } from "@/lib/comment-moderation";
import { getCommentsTag, toCommentEntry, type CommentRow } from "@/lib/comments";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getRequestIp, isTrustedMutationOrigin } from "@/lib/security/request";

export const dynamic = "force-dynamic";

const ALLOWED_ENTITY_TYPES = new Set(["code", "article", "catalog", "event", "list", "tool"]);
const MAX_BODY_LENGTH = 1000;
const MAX_GUEST_NAME_LENGTH = 60;
const MAX_GUEST_EMAIL_LENGTH = 120;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMENT_WRITE_RATE_LIMIT = {
  limit: 20,
  windowMs: 10 * 60 * 1000
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function isValidGuestEmail(value: string): boolean {
  if (!value) return false;
  if (value.length > MAX_GUEST_EMAIL_LENGTH) return false;
  if (!value.includes("@")) return false;
  const [local, domain] = value.split("@");
  if (!local || !domain) return false;
  if (!domain.includes(".")) return false;
  return true;
}

export async function POST(request: Request) {
  try {
    if (!isTrustedMutationOrigin(request)) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }

    const ip = getRequestIp(request);
    const rateLimit = checkRateLimit({
      key: `comments:create:${ip}`,
      ...COMMENT_WRITE_RATE_LIMIT
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many comment attempts. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
        }
      );
    }

    const payload = await request.json();
    const entityType = normalizeString(payload?.entityType);
    const entityId = normalizeString(payload?.entityId);
    const parentId = normalizeString(payload?.parentId || "");
    const body = normalizeString(payload?.body);
    const guestName = normalizeString(payload?.guestName);
    const guestEmail = normalizeEmail(payload?.guestEmail);

    if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
      return NextResponse.json({ error: "Invalid comment target." }, { status: 400 });
    }

    if (!UUID_REGEX.test(entityId)) {
      return NextResponse.json({ error: "Invalid comment target." }, { status: 400 });
    }

    if (!body) {
      return NextResponse.json({ error: "Comment cannot be empty." }, { status: 400 });
    }

    if (body.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: `Comments must be ${MAX_BODY_LENGTH} characters or less.` }, { status: 400 });
    }

    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      if (!guestName || guestName.length < 2 || guestName.length > MAX_GUEST_NAME_LENGTH) {
        return NextResponse.json({ error: "Please enter a valid name to comment." }, { status: 400 });
      }
      if (!isValidGuestEmail(guestEmail)) {
        return NextResponse.json({ error: "Please enter a valid email address to comment." }, { status: 400 });
      }
    }

    const admin = supabaseAdmin();

    if (parentId) {
      const { data: parentRow } = await admin
        .from("comments")
        .select("id, entity_type, entity_id")
        .eq("id", parentId)
        .maybeSingle();
      if (!parentRow || parentRow.entity_type !== entityType || parentRow.entity_id !== entityId) {
        return NextResponse.json({ error: "Invalid reply target." }, { status: 400 });
      }
    }

    const moderationDecision = await moderateCommentBody(body);
    if (!moderationDecision.approved) {
      return NextResponse.json({ error: "Comment did not pass moderation." }, { status: 400 });
    }

    const { data: inserted, error: insertError } = await admin
      .from("comments")
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        parent_id: parentId || null,
        author_id: sessionUser?.id ?? null,
        guest_name: sessionUser ? null : guestName,
        guest_email: sessionUser ? null : guestEmail,
        body_md: body,
        status: "approved",
        moderation: moderationDecision.moderation
      })
      .select("id")
      .maybeSingle();

    if (insertError || !inserted?.id) {
      console.error("Failed to insert comment", insertError);
      return NextResponse.json({ error: "Unable to submit comment." }, { status: 500 });
    }

    const { data: commentRow, error: commentError } = await admin
      .from("comments")
      .select(
        "id, parent_id, body_md, status, created_at, author_id, guest_name, author:app_users(display_name, roblox_avatar_url, roblox_display_name, roblox_username, role)"
      )
      .eq("id", inserted.id)
      .maybeSingle();

    if (commentError || !commentRow) {
      console.error("Failed to load comment", commentError);
      return NextResponse.json({ error: "Unable to load comment." }, { status: 500 });
    }

    const normalizedRow = {
      ...commentRow,
      author: Array.isArray(commentRow.author) ? (commentRow.author[0] ?? null) : (commentRow.author ?? null)
    } as unknown as CommentRow;

    const comment = await toCommentEntry(normalizedRow);

    revalidateTag(getCommentsTag(entityType, entityId), { expire: 0 });

    return NextResponse.json({ comment });
  } catch (error) {
    console.error("Unhandled comment error", error);
    return NextResponse.json({ error: "Unable to submit comment." }, { status: 500 });
  }
}
