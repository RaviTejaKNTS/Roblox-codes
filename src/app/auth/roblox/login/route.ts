import { NextResponse, type NextRequest } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/navigation";
import {
  buildRobloxAuthorizeUrl,
  createRobloxCodeChallenge,
  createRobloxCodeVerifier,
  createRobloxOauthState,
  getRobloxLoginRedirectConfigurationError,
  resolveRobloxLoginRedirectUri,
  setRobloxLoginOauthCookies
} from "@/lib/auth/roblox-login";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getRequestIp } from "@/lib/security/request";

const LOGIN_PATH = "/login";
const LOGIN_RATE_LIMIT = {
  limit: 30,
  windowMs: 60 * 1000
};
const AUTH_ROBOTS_DIRECTIVE = "noindex, nofollow";

function buildLoginRedirect(origin: string, status: "success" | "error", message: string, nextPath?: string) {
  const params = new URLSearchParams({ [status]: message });
  if (nextPath) {
    params.set("next", sanitizeNextPath(nextPath));
  }
  return `${origin}${LOGIN_PATH}?${params.toString()}`;
}

function withNoIndexHeaders(response: NextResponse) {
  response.headers.set("X-Robots-Tag", AUTH_ROBOTS_DIRECTIVE);
  return response;
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const requestedNext = request.nextUrl.searchParams.get("next");
  const nextPath = sanitizeNextPath(requestedNext);
  const clientId = process.env.ROBLOX_OAUTH_CLIENT_ID?.trim();
  const ip = getRequestIp(request);
  const rateLimit = checkRateLimit({
    key: `roblox-login:${ip}`,
    ...LOGIN_RATE_LIMIT
  });

  if (!rateLimit.allowed) {
    const response = NextResponse.redirect(
      buildLoginRedirect(origin, "error", "Too many login attempts. Please try again shortly.", nextPath),
      {
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
    return withNoIndexHeaders(response);
  }

  if (!clientId) {
    return withNoIndexHeaders(
      NextResponse.redirect(buildLoginRedirect(origin, "error", "Roblox OAuth is not configured.", nextPath))
    );
  }

  const redirectConfigError = getRobloxLoginRedirectConfigurationError(origin);
  if (redirectConfigError) {
    return withNoIndexHeaders(NextResponse.redirect(buildLoginRedirect(origin, "error", redirectConfigError, nextPath)));
  }

  const state = createRobloxOauthState();
  const verifier = createRobloxCodeVerifier();
  const challenge = createRobloxCodeChallenge(verifier);
  const redirectUri = resolveRobloxLoginRedirectUri(origin);

  const authUrl = buildRobloxAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge: challenge
  });

  const response = NextResponse.redirect(authUrl);
  setRobloxLoginOauthCookies(response, { state, verifier, nextPath });
  return withNoIndexHeaders(response);
}
