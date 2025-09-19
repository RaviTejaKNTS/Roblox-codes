  import { supabaseAdmin } from "@/lib/supabase";
  import { NextResponse } from "next/server";

  export const revalidate = 3600;

  export async function GET() {
    const sb = supabaseAdmin();
    const origin = process.env.SITE_URL || "http://localhost:3000";
    const { data: games } = await sb.from("games").select("slug, updated_at").eq("is_published", true).order("updated_at", { ascending: false });

    const pages: Array<{ loc: string; changefreq: string; priority: string; lastmod?: string }> = [
      { loc: `${origin}/`, changefreq: "daily", priority: "1.0" }
    ];

    for (const g of games || []) {
      pages.push({
        loc: `${origin}/${g.slug}`,
        changefreq: "daily",
        priority: "0.9",
        lastmod: g.updated_at ? new Date(g.updated_at).toISOString() : undefined
      });
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `<url><loc>${p.loc}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ""}<changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`).join("\n")}
</urlset>`;

    return new NextResponse(xml, { headers: { "content-type": "application/xml" } });
  }
