const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const isProduction = process.env.NODE_ENV === "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://*.google-analytics.com https://*.google.com https://*.gstatic.com https://scripts.scriptwrapper.com https://scripts.journeymv.com https://exchange.journeymv.com https://securepubads.g.doubleclick.net https://va.vercel-scripts.com",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com https:",
  "connect-src 'self' https://*.supabase.co https://*.google-analytics.com https://www.googletagmanager.com https://*.google.com https://scripts.journeymv.com https://keywords.journeymv.com https://exchange.journeymv.com https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://*.google.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://*.doubleclick.net",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' data: blob: https:",
  isProduction ? "upgrade-insecure-requests" : ""
].filter(Boolean).join("; ");

const nextConfig = {
  poweredByHeader: false,
  staticPageGenerationTimeout: 120,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" }
        ]
      },
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" }
        ]
      },
      {
        source: "/",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=1800, stale-while-revalidate=86400" }
        ]
      },
      {
        source: "/codes/:path*",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" }
        ]
      },
      {
        source: "/articles/:path*",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=86400, stale-while-revalidate=604800" }
        ]
      },
      {
        source: "/lists/:path*",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=86400" }
        ]
      },
      {
        source: "/tools/:path*",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=21600, stale-while-revalidate=86400" }
        ]
      },
      {
        source: "/checklists/:path*",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=21600, stale-while-revalidate=86400" }
        ]
      },
      {
        source: "/authors/:path*",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=604800, stale-while-revalidate=2592000" }
        ]
      },
      {
        source: "/sitemap.xml",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=21600, stale-while-revalidate=86400" }
        ]
      },
      {
        source: "/sitemaps/:path*",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=21600, stale-while-revalidate=86400" }
        ]
      },
      {
        source: "/robots.txt",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=86400, stale-while-revalidate=604800" }
        ]
      },
      {
        source: "/feed.xml",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=21600, stale-while-revalidate=604800" }
        ]
      }
    ];
  },
  images: {
    // Disable Next image optimizer to avoid Vercel billing and serve images directly.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "**.roblox.com" },
      { protocol: "https", hostname: "**.robloxden.com" },
      { protocol: "https", hostname: "**.ggpht.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "bmwksaykcsndsvgspapz.supabase.co" },
      { protocol: "https", hostname: "rbxcdn.com" },
      { protocol: "https", hostname: "**.rbxcdn.com" },
      { protocol: "https", hostname: "tr.rbxcdn.com" },
      { protocol: "https", hostname: "rbxcdn.net" },
      { protocol: "https", hostname: "**.rbxcdn.net" }
    ],
    formats: ["image/avif", "image/webp"],
  },
  serverExternalPackages: ["@supabase/supabase-js"],
  experimental: {
    serverActions: { allowedOrigins: ["*"] },
  },
};

module.exports = withBundleAnalyzer(nextConfig);
