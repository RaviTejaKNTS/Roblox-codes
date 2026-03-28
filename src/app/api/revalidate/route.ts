import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

type Payload =
  | { type: "code"; slug: string }
  | { type: "article"; slug: string }
  | { type: "list"; slug: string }
  | { type: "author"; slug: string }
  | { type: "event"; slug: string }
  | { type: "checklist"; slug: string }
  | { type: "tool"; slug: string }
  | { type: "catalog"; slug: string }
  | { type: "music"; slug: string }
  | { type: "quiz"; slug: string };

const MUSIC_CATALOG_CODES = new Set(["roblox-music-ids"]);
const FREE_ITEMS_CATALOG_CODE = "free-roblox-items";
const LEGACY_FREE_ITEMS_CATALOG_CODE = "roblox-free-items";
const FREE_ITEMS_CATALOG_PREFIXES = [FREE_ITEMS_CATALOG_CODE, LEGACY_FREE_ITEMS_CATALOG_CODE];
const FREE_ITEMS_BASE_PATH = `/catalog/${FREE_ITEMS_CATALOG_CODE}`;

function assertSecret(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return "REVALIDATE_SECRET env is not set";
  }
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (token !== secret) {
    return "Unauthorized";
  }
  return null;
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "");
}

function revalidateForCode(slug: string) {
  revalidatePath(`/codes/${slug}`);
  revalidatePath("/codes");
  revalidatePath("/"); // home shows featured codes
  revalidatePath("/sitemap.xml");
  revalidateTag(`code:${slug}`, { expire: 0 });
  revalidateTag("codes", { expire: 0 });
  revalidateTag("codes-index", { expire: 0 });
  revalidateTag("home", { expire: 0 });
}

function revalidateForArticle(slug: string) {
  revalidatePath(`/articles/${slug}`);
  revalidatePath("/articles");
  revalidatePath("/"); // home shows latest articles
  revalidatePath("/sitemap.xml");
  revalidateTag(`article:${slug}`, { expire: 0 });
  revalidateTag("articles", { expire: 0 });
  revalidateTag("articles-index", { expire: 0 });
}

function revalidateForList(slug: string) {
  revalidatePath(`/lists/${slug}`);
  // Revalidate all paginated list pages (dynamic [page] segment)
  revalidatePath(`/lists/${slug}/page/[page]`);
  revalidatePath("/lists");
  revalidatePath("/sitemap.xml");
  revalidateTag(`list:${slug}`, { expire: 0 });
  revalidateTag("lists", { expire: 0 });
  revalidateTag("lists-index", { expire: 0 });
}

function revalidateForAuthor(slug: string) {
  revalidatePath(`/authors/${slug}`);
  revalidatePath("/authors");
  revalidateTag(`author:${slug}`, { expire: 0 });
  revalidateTag("authors", { expire: 0 });
  revalidateTag("authors-index", { expire: 0 });
}

function revalidateForEvents(slug: string) {
  revalidatePath("/events");
  revalidatePath(`/events/${slug}`);
  revalidatePath("/sitemap.xml");
}

function revalidateForChecklists(slug: string) {
  revalidatePath("/checklists");
  revalidatePath("/checklists/page/[page]");
  revalidatePath(`/checklists/${slug}`);
  revalidatePath("/sitemap.xml");
  revalidateTag("checklists-index", { expire: 0 });
}

function revalidateForQuizzes(slug: string) {
  revalidatePath("/quizzes");
  revalidatePath(`/quizzes/${slug}`);
  revalidatePath("/sitemap.xml");
  revalidatePath("/sitemaps/quizzes.xml");
  revalidateTag("quizzes-index", { expire: 0 });
}

function revalidateForTools(slug: string) {
  revalidatePath("/tools");
  revalidatePath("/tools/page/[page]");
  revalidatePath(`/tools/${slug}`);
  revalidatePath("/sitemap.xml");
  revalidateTag("tools-index", { expire: 0 });
}

function revalidateForCatalog(slug: string) {
  revalidatePath("/catalog");
  if (slug) {
    revalidatePath(`/catalog/${slug}`);
    revalidateTag(`catalog:${slug}`, { expire: 0 });
  }
  revalidatePath("/sitemap.xml");
  revalidateTag("catalog-index", { expire: 0 });
}

function revalidateForMusic() {
  revalidatePath("/catalog");
  revalidatePath("/catalog/roblox-music-ids");
  revalidatePath("/catalog/roblox-music-ids/page/[page]");
  revalidatePath("/catalog/roblox-music-ids/trending");
  revalidatePath("/catalog/roblox-music-ids/trending/page/[page]");
  revalidatePath("/catalog/roblox-music-ids/genres");
  revalidatePath("/catalog/roblox-music-ids/genres/page/[page]");
  revalidatePath("/catalog/roblox-music-ids/genres/[genre]");
  revalidatePath("/catalog/roblox-music-ids/genres/[genre]/page/[page]");
  revalidatePath("/catalog/roblox-music-ids/artists");
  revalidatePath("/catalog/roblox-music-ids/artists/page/[page]");
  revalidatePath("/catalog/roblox-music-ids/artists/[artist]");
  revalidatePath("/catalog/roblox-music-ids/artists/[artist]/page/[page]");
  revalidatePath("/sitemap.xml");
}

function isFreeItemsCatalogSlug(slug: string) {
  return FREE_ITEMS_CATALOG_PREFIXES.some((prefix) => slug === prefix || slug.startsWith(`${prefix}/`));
}

function revalidateForFreeItems() {
  revalidatePath("/catalog");
  revalidatePath(FREE_ITEMS_BASE_PATH);
  revalidatePath(`${FREE_ITEMS_BASE_PATH}/page/[page]`);
  revalidatePath(`${FREE_ITEMS_BASE_PATH}/[category]`);
  revalidatePath(`${FREE_ITEMS_BASE_PATH}/[category]/page/[page]`);
  revalidatePath(`${FREE_ITEMS_BASE_PATH}/[category]/[subcategory]`);
  revalidatePath(`${FREE_ITEMS_BASE_PATH}/[category]/[subcategory]/page/[page]`);
  revalidatePath("/sitemap.xml");
  revalidateTag("free-items-catalog", { expire: 0 });
}

export async function POST(request: Request) {
  const authError = assertSecret(request);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || typeof (payload as any).slug !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const slug = normalizeSlug(payload.slug);
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  switch (payload.type) {
    case "code":
      revalidateForCode(slug);
      break;
    case "article":
      revalidateForArticle(slug);
      break;
    case "list":
      revalidateForList(slug);
      break;
    case "author":
      revalidateForAuthor(slug);
      break;
    case "event":
      revalidateForEvents(slug);
      break;
    case "checklist":
      revalidateForChecklists(slug);
      break;
    case "quiz":
      revalidateForQuizzes(slug);
      break;
    case "tool":
      revalidateForTools(slug);
      break;
    case "catalog":
      if (MUSIC_CATALOG_CODES.has(slug)) {
        revalidateForMusic();
      }
      if (isFreeItemsCatalogSlug(slug)) {
        revalidateForFreeItems();
      }
      revalidateForCatalog(slug);
      break;
    case "music":
      revalidateForMusic();
      break;
    default:
      return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  }

  const indexNow = {
    enabled: false,
    attempted: 0,
    submitted: 0,
    successfulBatches: 0,
    failedBatches: 0,
    reason: "site-disabled"
  };

  return NextResponse.json({ revalidated: true, type: payload.type, slug, indexNow });
}
