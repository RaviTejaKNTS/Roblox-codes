import crypto from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/navigation";

const ROBLOX_AUTHORIZE_URL = "https://apis.roblox.com/oauth/v1/authorize";
const ROBLOX_TOKEN_URL = "https://apis.roblox.com/oauth/v1/token";
const ROBLOX_USERINFO_URL = "https://apis.roblox.com/oauth/v1/userinfo";
const ROBLOX_OAUTH_SCOPE = "openid profile";
const OAUTH_COOKIE_MAX_AGE_SECONDS = 60 * 10; // 10 minutes

export const ROBLOX_LOGIN_STATE_COOKIE = "roblox_login_oauth_state";
export const ROBLOX_LOGIN_VERIFIER_COOKIE = "roblox_login_oauth_verifier";
export const ROBLOX_LOGIN_NEXT_COOKIE = "roblox_login_oauth_next";
const ROBLOX_LOGIN_CALLBACK_PATH = "/auth/roblox/callback/login";
const ROBLOX_LOGIN_LEGACY_CALLBACK_PATH = "/auth/roblox/callback";

type RobloxTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

export type RobloxUserInfo = {
  sub?: string;
  preferred_username?: string | null;
  name?: string | null;
  nickname?: string | null;
  profile?: string | null;
  picture?: string | null;
};

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

function toBase64Url(value: Buffer) {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function isAllowedRobloxCallbackPath(pathname: string): boolean {
  return pathname === ROBLOX_LOGIN_CALLBACK_PATH || pathname === ROBLOX_LOGIN_LEGACY_CALLBACK_PATH;
}

function parseRobloxRedirectUriCandidate(value: string | null | undefined): URL | null {
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (process.env.NODE_ENV === "production" && protocol !== "https:") {
    return null;
  }
  if (protocol !== "https:" && !isLocalHost(parsed.hostname.toLowerCase())) {
    return null;
  }
  if (!isAllowedRobloxCallbackPath(parsed.pathname)) {
    return null;
  }

  parsed.hash = "";
  parsed.search = "";
  return parsed;
}

export function getRobloxLoginRedirectConfigurationError(origin: string): string | null {
  const configured = parseRobloxRedirectUriCandidate(process.env.ROBLOX_OAUTH_LOGIN_REDIRECT_URI);
  if (configured) return null;

  let requestOrigin: URL;
  try {
    requestOrigin = new URL(origin);
  } catch {
    return "Roblox OAuth redirect origin is invalid.";
  }

  if (!isLocalHost(requestOrigin.hostname.toLowerCase())) {
    return null;
  }

  const expectedCallback = `${requestOrigin.origin}${ROBLOX_LOGIN_CALLBACK_PATH}`;
  return `Roblox OAuth is not configured for this local URL. Register ${expectedCallback} in your Roblox app or set ROBLOX_OAUTH_LOGIN_REDIRECT_URI to an allowed callback.`;
}

export function resolveRobloxLoginRedirectUri(origin: string): string {
  const fallback = `${origin}${ROBLOX_LOGIN_CALLBACK_PATH}`;
  const configured = parseRobloxRedirectUriCandidate(process.env.ROBLOX_OAUTH_LOGIN_REDIRECT_URI);
  return configured?.toString() ?? fallback;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS
  };
}

export function createRobloxOauthState(): string {
  return toBase64Url(crypto.randomBytes(16));
}

export function createRobloxCodeVerifier(): string {
  return toBase64Url(crypto.randomBytes(32));
}

export function createRobloxCodeChallenge(verifier: string): string {
  return toBase64Url(crypto.createHash("sha256").update(verifier).digest());
}

export function setRobloxLoginOauthCookies(
  response: NextResponse,
  params: { state: string; verifier: string; nextPath: string }
) {
  const options = cookieOptions();
  response.cookies.set(ROBLOX_LOGIN_STATE_COOKIE, params.state, options);
  response.cookies.set(ROBLOX_LOGIN_VERIFIER_COOKIE, params.verifier, options);
  response.cookies.set(ROBLOX_LOGIN_NEXT_COOKIE, sanitizeNextPath(params.nextPath), options);
}

export function clearRobloxLoginOauthCookies(response: NextResponse) {
  const clearOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  };
  response.cookies.set(ROBLOX_LOGIN_STATE_COOKIE, "", clearOptions);
  response.cookies.set(ROBLOX_LOGIN_VERIFIER_COOKIE, "", clearOptions);
  response.cookies.set(ROBLOX_LOGIN_NEXT_COOKIE, "", clearOptions);
}

export function readRobloxLoginOauthCookies(request: NextRequest): {
  state: string | null;
  verifier: string | null;
  nextPath: string;
} {
  const state = request.cookies.get(ROBLOX_LOGIN_STATE_COOKIE)?.value ?? null;
  const verifier = request.cookies.get(ROBLOX_LOGIN_VERIFIER_COOKIE)?.value ?? null;
  const nextRaw = request.cookies.get(ROBLOX_LOGIN_NEXT_COOKIE)?.value ?? null;
  return {
    state,
    verifier,
    nextPath: sanitizeNextPath(nextRaw)
  };
}

export function buildRobloxAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(ROBLOX_AUTHORIZE_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ROBLOX_OAUTH_SCOPE);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeRobloxCodeForToken(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<{ accessToken: string | null; errorMessage: string | null }> {
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    code_verifier: params.verifier,
    redirect_uri: params.redirectUri
  });

  const basicAuth = Buffer.from(`${params.clientId}:${params.clientSecret}`).toString("base64");
  const tokenRes = await fetch(ROBLOX_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`
    },
    body: tokenBody.toString(),
    cache: "no-store"
  });

  const tokenData = (await tokenRes.json().catch(() => null)) as RobloxTokenResponse | null;
  if (!tokenRes.ok || !tokenData?.access_token) {
    const errorMessage = tokenData?.error_description || tokenData?.error || "Roblox token exchange failed.";
    return {
      accessToken: null,
      errorMessage
    };
  }

  return {
    accessToken: tokenData.access_token,
    errorMessage: null
  };
}

export async function fetchRobloxUserInfo(accessToken: string): Promise<{ userInfo: RobloxUserInfo | null; errorMessage: string | null }> {
  const userInfoRes = await fetch(ROBLOX_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  const userInfo = (await userInfoRes.json().catch(() => null)) as RobloxUserInfo | null;
  if (!userInfoRes.ok || !userInfo?.sub) {
    return {
      userInfo: null,
      errorMessage: "Unable to fetch Roblox profile."
    };
  }

  return {
    userInfo,
    errorMessage: null
  };
}
