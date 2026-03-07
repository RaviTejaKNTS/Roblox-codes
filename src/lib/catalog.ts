import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";

export type CatalogFaqEntry = { q: string; a: string };

export type CatalogPageContent = {
  id?: string;
  universe_id?: number | null;
  code: string;
  title: string;
  seo_title: string;
  meta_description: string;
  intro_md: string | null;
  how_it_works_md: string | null;
  description_json: Record<string, string>;
  faq_json: CatalogFaqEntry[];
  cta_label?: string | null;
  cta_url?: string | null;
  schema_ld_json?: unknown;
  thumb_url?: string | null;
  is_published: boolean;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
  content_updated_at?: string | null;
};

export type CatalogListEntry = Pick<
  CatalogPageContent,
  "id" | "code" | "title" | "meta_description" | "thumb_url" | "universe_id" | "published_at" | "created_at" | "updated_at" | "content_updated_at"
>;

const CATALOG_SELECT_FIELDS_VIEW =
  "id, universe_id, code, title, seo_title, meta_description, intro_md, how_it_works_md, description_json, faq_json, cta_label, cta_url, schema_ld_json, thumb_url, is_published, published_at, created_at, updated_at, content_updated_at";
const CATALOG_SELECT_FIELDS_BASE =
  "id, universe_id, code, title, seo_title, meta_description, intro_md, how_it_works_md, description_json, faq_json, cta_label, cta_url, schema_ld_json, thumb_url, is_published, published_at, created_at, updated_at";
const CATALOG_REVALIDATE_SECONDS = 86400;

function normalizeCatalogCodes(codes: string[]): string[] {
  return Array.from(
    new Set(
      codes
        .map((code) => code.trim())
        .filter(Boolean)
    )
  );
}

function buildCatalogTags(codes: string[]): string[] {
  const normalized = Array.from(new Set(codes.map((code) => code.toLowerCase())));
  return ["catalog-index", ...normalized.map((code) => `catalog:${code}`)];
}

function pickFirstByCodeOrder<T extends { code: string }>(rows: T[], codes: string[]): T | null {
  for (const code of codes) {
    const match = rows.find((row) => row.code === code);
    if (match) return match;
  }
  return rows[0] ?? null;
}

async function fetchCatalogContent(codes: string[]): Promise<CatalogPageContent | null> {
  if (!codes.length) return null;
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("catalog_pages_view")
    .select(CATALOG_SELECT_FIELDS_VIEW)
    .in("code", codes)
    .eq("is_published", true);

  if (!error && data?.length) {
    return pickFirstByCodeOrder(data as CatalogPageContent[], codes);
  }

  const { data: fallback, error: fallbackError } = await supabase
    .from("catalog_pages")
    .select(CATALOG_SELECT_FIELDS_BASE)
    .in("code", codes)
    .eq("is_published", true);

  if (fallbackError) {
    console.error("Error fetching catalog page content", fallbackError);
    return null;
  }

  if (!fallback?.length) return null;
  return pickFirstByCodeOrder(fallback as CatalogPageContent[], codes);
}

export async function getCatalogPageContentByCodes(codes: string[]): Promise<CatalogPageContent | null> {
  const normalizedCodes = normalizeCatalogCodes(codes);
  if (!normalizedCodes.length) return null;

  const cachedCatalogContent = unstable_cache(
    async (requestedCodes: string[]) => fetchCatalogContent(requestedCodes),
    ["catalog-page-content", ...normalizedCodes],
    {
      revalidate: CATALOG_REVALIDATE_SECONDS,
      tags: buildCatalogTags(normalizedCodes)
    }
  );

  return cachedCatalogContent(normalizedCodes);
}

export async function listPublishedCatalogCodes(): Promise<string[]> {
  const cached = unstable_cache(
    async () => {
      const supabase = supabaseAdmin();
      const { data, error } = await supabase
        .from("catalog_pages")
        .select("code")
        .eq("is_published", true)
        .not("code", "is", null);

      if (error) throw error;
      return (data ?? [])
        .map((row) => (row as { code: string | null }).code)
        .filter((code): code is string => typeof code === "string" && code.length > 0);
    },
    ["listPublishedCatalogCodes"],
    {
      revalidate: CATALOG_REVALIDATE_SECONDS,
      tags: ["catalog-index"]
    }
  );

  return cached();
}

export async function listPublishedCatalogPagesByUniverseId(
  universeId: number,
  limit = 2
): Promise<CatalogListEntry[]> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 2;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("catalog_pages_view")
    .select("id, code, title, meta_description, thumb_url, universe_id, published_at, created_at, updated_at, content_updated_at")
    .eq("is_published", true)
    .eq("universe_id", universeId)
    .order("content_updated_at", { ascending: false })
    .limit(safeLimit);

  if (!error && data) {
    return (data ?? []) as CatalogListEntry[];
  }

  const { data: fallback, error: fallbackError } = await supabase
    .from("catalog_pages")
    .select("id, code, title, meta_description, thumb_url, universe_id, published_at, created_at, updated_at")
    .eq("is_published", true)
    .eq("universe_id", universeId)
    .order("updated_at", { ascending: false })
    .limit(safeLimit);

  if (fallbackError) {
    console.error("Error fetching catalog pages by universe", fallbackError);
    return [];
  }

  return (fallback ?? []) as CatalogListEntry[];
}
