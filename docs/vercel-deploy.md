## Deploying to Vercel

1) Create a Vercel project and point it at this repo (Framework: Next.js, Build Command: `npm run build`).  
2) Set environment variables in Vercel (Production, Preview, Development as needed). At minimum:
   - Core: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE`, `SUPABASE_MEDIA_BUCKET`, `REVALIDATE_SECRET`, `AUTH_SESSION_SECRET`, `AUTH_SESSION_TTL_SECONDS`, `ROBLOX_OAUTH_CLIENT_ID`, `ROBLOX_OAUTH_CLIENT_SECRET`, `ROBLOX_OAUTH_LOGIN_REDIRECT_URI`
   - Public: `NEXT_PUBLIC_DEFAULT_AUTHOR_ID`, `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID`
   - Integrations/ops: `OPENAI_API_KEY`, `GOOGLE_SEARCH_KEY`, `GOOGLE_SEARCH_CX`, `TELEGRAM_CHANNEL_ID`, `TELEGRAM_BOT_TOKEN`, `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET`, `ROBLOX_OPEN_CLOUD_API_KEY`
   - Optional build/runtime tuning: `ADS_TXT_URL`, `REFRESH_PAGE_SIZE`, `REFRESH_CONCURRENCY`, `REFRESH_BATCH_DELAY_MS`, `REFRESH_ONLY_SLUGS`
   Rotate secrets when moving providers and avoid storing prod values in `.env`.
3) Add custom domains in Vercel; keep `bloxodes.com` canonical. `next.config.js` already enforces `www.bloxodes.com` → apex redirect.
4) For cache warm/ISR refresh, you can hit `/api/revalidate` with `Authorization: Bearer $REVALIDATE_SECRET` after publishing new content.
5) If you need scheduled refresh jobs (e.g., `npm run refresh:codes`), wrap the logic in API/route handlers and wire them to Vercel Cron Jobs.

Notes:
- `vercel.json` sets Node 20 for API routes and a 60s cap; adjust memory/runtime there if a route needs more headroom.
- Netlify config is unused on Vercel; safe to keep or delete. The caching headers are already defined inside `next.config.js`.
