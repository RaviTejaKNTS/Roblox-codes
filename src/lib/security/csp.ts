import cspDirectives from "@/config/csp-directives.json";

export type CspMode = "off" | "report-only" | "enforce";

type SecurityHeader = {
  key: string;
  value: string;
};

const isProduction = process.env.NODE_ENV === "production";
const securePathPrefixes = ["/api", "/auth", "/login", "/account", "/admin"] as const;
const noIndexPathPrefixes = ["/auth", "/login", "/account", "/admin"] as const;

export function resolveCspMode(value: string | undefined, productionMode = isProduction): CspMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "off" || normalized === "report-only" || normalized === "enforce") {
    return normalized;
  }

  return productionMode ? "enforce" : "off";
}

function matchesPathPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export const cspMode = resolveCspMode(process.env.CSP_MODE, isProduction);
export const cspHeaderKey =
  cspMode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";

export const publicCsp = (
  isProduction ? cspDirectives.publicProductionDirectives : cspDirectives.developmentDirectives
).join("; ");

export const secureCsp = (
  isProduction ? cspDirectives.secureProductionDirectives : cspDirectives.developmentDirectives
).join("; ");

export function isSecurePath(pathname: string) {
  return securePathPrefixes.some((prefix) => matchesPathPrefix(pathname, prefix));
}

export function shouldNoIndexPath(pathname: string) {
  return noIndexPathPrefixes.some((prefix) => matchesPathPrefix(pathname, prefix));
}

export function getCspForPath(pathname: string) {
  return isSecurePath(pathname) ? secureCsp : publicCsp;
}

export function buildSecurityHeaders(pathname: string, mode: CspMode = cspMode): SecurityHeader[] {
  const securePath = isSecurePath(pathname);
  const headers: SecurityHeader[] = [
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: securePath ? "DENY" : "SAMEORIGIN" }
  ];

  if (shouldNoIndexPath(pathname)) {
    headers.push({ key: "X-Robots-Tag", value: "noindex, nofollow" });
  }

  if (mode !== "off") {
    headers.unshift({
      key: mode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
      value: securePath ? secureCsp : publicCsp
    });
  }

  return headers;
}
