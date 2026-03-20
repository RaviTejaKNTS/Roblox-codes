const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
const {
  publicProductionDirectives,
  secureProductionDirectives,
  developmentDirectives
} = require("./src/config/csp-directives.json");

const isProduction = process.env.NODE_ENV === "production";
const configuredCspMode = (process.env.CSP_MODE || (isProduction ? "enforce" : "off")).trim().toLowerCase();
const cspMode =
  configuredCspMode === "off" || configuredCspMode === "report-only" || configuredCspMode === "enforce"
    ? configuredCspMode
    : isProduction
      ? "enforce"
      : "off";

const publicCsp = (isProduction ? publicProductionDirectives : developmentDirectives).join("; ");
const secureCsp = (isProduction ? secureProductionDirectives : developmentDirectives).join("; ");
if (cspMode !== "off" && (!publicCsp || !secureCsp)) {
  throw new Error("CSP directives must not be empty.");
}

const nextConfig = {
  poweredByHeader: false,
  staticPageGenerationTimeout: 120,
  async headers() {
    return [
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
