  import { supabaseAdmin } from "@/lib/supabase";
  import { NextResponse } from "next/server";

  export const revalidate = 3600;

  export async function GET() {
    const sb = supabaseAdmin();
    const origin = process.env.SITE_URL || "http://localhost:3000";
    const { data: games } = await sb.from("games").select("slug, updated_at").eq("is_published", true).order("updated_at", { ascending: false });

    const pages = [
      { loc: `${origin}/`, changefreq: "hourly", priority: "1.0" },
    ];

    for (const g of games || []) {
      pages.push({ loc: `${origin}/${g.slug}`, changefreq: "hourly", priority: "0.9" });
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `<url><loc>${p.loc}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`).join("\n")}
</urlset>`;

    return new NextResponse(xml, { headers: { "content-type": "application/xml" } });
  }
