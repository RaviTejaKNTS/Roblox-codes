import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const revalidate = 3600;

export async function GET() {
  const sb = supabaseAdmin();
  const origin = process.env.SITE_URL || "http://localhost:3000";

  const [{ data: games }, { data: authors }] = await Promise.all([
    sb
      .from("games")
      .select("slug, updated_at")
      .eq("is_published", true)
      .order("updated_at", { ascending: false }),
    sb
      .from("authors")
      .select("slug, updated_at")
      .order("updated_at", { ascending: false })
  ]);

  const pages: Array<{ loc: string; changefreq: string; priority: string; lastmod?: string }> = [
    { loc: `${origin}/`, changefreq: "daily", priority: "1.0" }
  ];

  const staticRoutes: Array<{ path: string; changefreq: string; priority: string }> = [
    { path: "/about", changefreq: "monthly", priority: "0.6" },
    { path: "/contact", changefreq: "monthly", priority: "0.6" },
    { path: "/privacy-policy", changefreq: "yearly", priority: "0.5" },
    { path: "/editorial-guidelines", changefreq: "monthly", priority: "0.5" },
    { path: "/disclaimer", changefreq: "monthly", priority: "0.5" },
    { path: "/authors", changefreq: "weekly", priority: "0.6" }
  ];

  for (const route of staticRoutes) {
    pages.push({
      loc: `${origin}${route.path}`,
      changefreq: route.changefreq,
      priority: route.priority
    });
  }

  for (const g of games || []) {
    pages.push({
      loc: `${origin}/${g.slug}`,
      changefreq: "daily",
      priority: "0.9",
      lastmod: g.updated_at ? new Date(g.updated_at).toISOString() : undefined
    });
  }

  for (const author of authors || []) {
    if (!author?.slug) continue;
    pages.push({
      loc: `${origin}/authors/${author.slug}`,
      changefreq: "weekly",
      priority: "0.5",
      lastmod: author.updated_at ? new Date(author.updated_at).toISOString() : undefined
    });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (p) =>
      `<url><loc>${p.loc}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ""}<changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`
  )
  .join("\n")}
</urlset>`;

  return new NextResponse(xml, { headers: { "content-type": "application/xml" } });
}
