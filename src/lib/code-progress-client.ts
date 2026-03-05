"use client";

import { useEffect, useState } from "react";

type CodeSessionState = {
  status: "loading" | "ready";
  userId: string | null;
};

const SESSION_ENDPOINT = "/api/codes/session";
const PROGRESS_ENDPOINT = "/api/codes/progress";

let sessionState: CodeSessionState = { status: "loading", userId: null };
let sessionPromise: Promise<void> | null = null;
const sessionListeners = new Set<(state: CodeSessionState) => void>();
let sessionCheckedAt = 0;

const MAX_USED_CODES = 1000;

function notifySession() {
  sessionListeners.forEach((listener) => listener(sessionState));
}

async function fetchSession(force = false) {
  if (sessionPromise) return sessionPromise;
  const now = Date.now();
  if (!force && sessionState.status === "ready" && now - sessionCheckedAt < 15000) {
    return Promise.resolve();
  }

  const keepReady = sessionState.status === "ready";
  if (!keepReady) {
    sessionState = { ...sessionState, status: "loading" };
    notifySession();
  }

  sessionPromise = (async () => {
    try {
      const res = await fetch(SESSION_ENDPOINT, { credentials: "include" });
      const payload = await res.json().catch(() => ({}));
      const userId = typeof payload?.userId === "string" ? payload.userId : null;
      sessionState = { status: "ready", userId };
      sessionCheckedAt = Date.now();
    } catch {
      sessionState = { status: "ready", userId: null };
      sessionCheckedAt = Date.now();
    } finally {
      sessionPromise = null;
      notifySession();
    }
  })();

  return sessionPromise;
}

function normalizeUsedCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const result: string[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= MAX_USED_CODES) break;
  }

  return result;
}

export function useCodeProgressSession(): CodeSessionState {
  const [state, setState] = useState(sessionState);

  useEffect(() => {
    sessionListeners.add(setState);
    void fetchSession(true);

    return () => {
      sessionListeners.delete(setState);
    };
  }, []);

  return state;
}

export function getCodeProgressStorageKey(gameSlug: string) {
  return `code-progress:${gameSlug.trim().toLowerCase()}`;
}

export function getLegacyCodeProgressStorageKey(gameName: string) {
  const slug = gameName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "default";
  return `roblox-codes-checked-${slug}`;
}

export function readLocalCodeProgress(gameSlug: string, gameName: string): string[] {
  if (typeof window === "undefined") return [];

  const keys = [getCodeProgressStorageKey(gameSlug), getLegacyCodeProgressStorageKey(gameName)];

  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      return normalizeUsedCodes(JSON.parse(raw));
    } catch {
      // ignore storage errors
    }
  }

  return [];
}

export function writeLocalCodeProgress(gameSlug: string, gameName: string, usedCodes: string[]) {
  if (typeof window === "undefined") return;

  const normalized = normalizeUsedCodes(usedCodes);

  try {
    window.localStorage.setItem(getCodeProgressStorageKey(gameSlug), JSON.stringify(normalized));
    window.localStorage.setItem(getLegacyCodeProgressStorageKey(gameName), JSON.stringify(normalized));
  } catch {
    // ignore storage errors
  }
}

export async function loadAccountCodeProgress(gameSlug: string): Promise<string[]> {
  const trimmed = gameSlug.trim();
  if (!trimmed) return [];

  try {
    const res = await fetch(`${PROGRESS_ENDPOINT}?slug=${encodeURIComponent(trimmed)}`, {
      credentials: "include"
    });
    if (!res.ok) return [];
    const payload = await res.json().catch(() => ({}));
    return normalizeUsedCodes(payload?.usedCodes);
  } catch {
    return [];
  }
}

export async function saveAccountCodeProgress(gameSlug: string, usedCodes: string[]): Promise<boolean> {
  const trimmed = gameSlug.trim();
  if (!trimmed) return false;

  try {
    const res = await fetch(PROGRESS_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        slug: trimmed,
        usedCodes: normalizeUsedCodes(usedCodes)
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}
