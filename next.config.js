const nextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.roblox.com" },
      { protocol: "https", hostname: "**.robloxden.com" },
      { protocol: "https", hostname: "**.ggpht.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "**" },
    ],
  },
  experimental: {
    serverActions: { allowedOrigins: ["*"] },
    serverComponentsExternalPackages: ["@supabase/supabase-js"],
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.bloxodes.com" }],
        destination: "https://bloxodes.com/:path*",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
