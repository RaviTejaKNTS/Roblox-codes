import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import legacySlugs from "@/data/slug_oldslugs.json";
import { buildSecurityHeaders } from "@/lib/security/csp";

const GDPR_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "GI",
  "AX",
  "IC",
  "EA",
  "GF",
  "GP",
  "MQ",
  "RE",
  "YT",
  "MF",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
  "CH",
  "GB"
]);

const CONSENT_HEADER = "x-require-consent";
const CONSENT_COOKIE = "require-consent";
const CONSENT_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const CANONICAL_HOST = "bloxodes.com";

const ARTICLE_REDIRECT_SLUGS = new Set([
  "when-does-the-museum-open-in-jailbreak-roblox",
  "how-to-level-up-fast-in-jailbreak-criminal-vs-cop",
  "how-to-get-a-mansion-invite-in-jailbreak-roblox",
  "steal-a-brainrot-dealer-update-guide",
  "why-roblox-s-simple-graphics-still-beat-every-realistic-game",
  "where-to-find-criminal-base-on-roblox-jailbreak",
  "how-to-get-robux-free-and-paid",
  "best-simple-roblox-games-for-beginners",
  "how-to-get-spooky-chest-in-grow-a-garden",
  "roblox-halloween-spotlight-event-2025",
  "create-and-publish-roblox-game",
  "all-fisch-enchantments-guide"
]);

type LegacySlugEntry = {
  slug: string;
  old_slugs: string[];
};

const LEGACY_SLUG_MAP = new Map<string, string>(
  (legacySlugs as LegacySlugEntry[]).flatMap(({ slug, old_slugs }) => {
    const canonical = slug.trim().toLowerCase();
    return old_slugs
      .map((oldSlug) => oldSlug?.trim().toLowerCase())
      .filter((oldSlug): oldSlug is string => Boolean(oldSlug) && oldSlug !== canonical)
      .map((oldSlug) => [oldSlug, canonical]);
  })
);

function applyConsentState(res: NextResponse, requiresConsent: boolean, attachState = true) {
  if (!attachState) {
    return res;
  }

  res.headers.set(CONSENT_HEADER, requiresConsent ? "1" : "0");
  res.cookies.set({
    name: CONSENT_COOKIE,
    value: requiresConsent ? "1" : "0",
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CONSENT_MAX_AGE
  });
  return res;
}

function applySecurityHeaders(res: NextResponse, pathname: string) {
  for (const { key, value } of buildSecurityHeaders(pathname)) {
    res.headers.set(key, value);
  }

  return res;
}

function shouldAttachConsentState(pathname: string) {
  if (pathname === "/robots.txt") return false;
  if (pathname === "/sitemap.xml") return false;
  if (pathname === "/feed.xml") return false;
  if (/^\/sitemaps\/.+\.xml$/i.test(pathname)) return false;
  return true;
}

function normalizeSlugSegment(value: string) {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  decoded = decoded.trim().toLowerCase();
  return decoded;
}

function resolveLegacyRedirectPath(pathname: string): string | null {
  const normalizedPath = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  // Never canonicalize legacy slugs inside the `/codes/*` namespace.
  // We only support legacy root slugs here.
  if (/^\/codes(?:\/|$)/i.test(normalizedPath)) {
    return null;
  }

  const rootMatch = normalizedPath.match(/^\/([^/]+)$/);
  if (rootMatch) {
    const slug = normalizeSlugSegment(rootMatch[1]);
    if (ARTICLE_REDIRECT_SLUGS.has(slug)) {
      return `/articles/${slug}`;
    }
    const canonical = LEGACY_SLUG_MAP.get(slug);
    if (canonical) {
      return `/codes/${canonical}`;
    }
  }

  return null;
}

function getRequestHostname(req: NextRequest) {
  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    req.nextUrl.host;

  return host.split(":")[0].toLowerCase();
}

function redirectWithStatus(url: URL, status: 301 | 302 | 307 | 308 = 307) {
  return new NextResponse(null, {
    status,
    headers: {
      Location: url.toString()
    }
  });
}

function shouldRedirectToCanonicalHost(hostname: string) {
  if (hostname === CANONICAL_HOST) return false;
  if (hostname === "localhost") return false;
  if (hostname === "127.0.0.1") return false;
  if (hostname === "[::1]") return false;
  if (hostname.endsWith(".localhost")) return false;
  return true;
}

export function proxy(req: NextRequest) {
  // Prefer Vercel geo (works when DNS is on Vercel), fall back to Cloudflare if proxied.
  const country =
    req.headers.get("x-vercel-ip-country")?.toUpperCase() ||
    req.headers.get("x-vercel-ip-country-region")?.toUpperCase() ||
    (req as any).geo?.country?.toUpperCase() ||
    req.headers.get("cf-ipcountry")?.toUpperCase() ||
    "";

  const requiresConsent = GDPR_COUNTRIES.has(country);
  const url = req.nextUrl;
  const hostname = getRequestHostname(req);
  const attachConsentState = shouldAttachConsentState(url.pathname);
  const hostRedirectNeeded = shouldRedirectToCanonicalHost(hostname);
  const legacyPath = resolveLegacyRedirectPath(url.pathname);
  const pathRedirectNeeded = Boolean(legacyPath && legacyPath !== url.pathname);

  if (hostRedirectNeeded || pathRedirectNeeded) {
    const redirectUrl = url.clone();
    if (hostRedirectNeeded) {
      redirectUrl.hostname = CANONICAL_HOST;
      redirectUrl.port = "";
    }
    if (legacyPath) {
      redirectUrl.pathname = legacyPath;
    }
    return applySecurityHeaders(
      applyConsentState(redirectWithStatus(redirectUrl, 301), requiresConsent, attachConsentState),
      redirectUrl.pathname
    );
  }

  // Pass a header downstream so layouts can decide whether to show consent UI.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(CONSENT_HEADER, requiresConsent ? "1" : "0");

  return applySecurityHeaders(
    applyConsentState(NextResponse.next({ request: { headers: requestHeaders } }), requiresConsent, attachConsentState),
    url.pathname
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|favicon-16x16\\.png|favicon-32x32\\.png|favicon-48x48\\.png|android-chrome-192x192\\.png|android-chrome-512x512\\.png|apple-touch-icon\\.png|site\\.webmanifest|og-image\\.png|Bloxodes-dark\\.png|Bloxodes-light\\.png|Bloxodes\\.png).*)"
  ]
};
