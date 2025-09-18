const nextConfig = {
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
};

module.exports = nextConfig;
