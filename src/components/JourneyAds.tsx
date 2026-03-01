"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useConsent } from "./consent/ConsentProvider";

type JourneyAdsProps = {
  excludePrefix?: string;
  idleDelay?: number;
};

const DEFAULT_IDLE_DELAY = 4000;
const JOURNEY_SCRIPT_SRC =
  "https://scripts.scriptwrapper.com/tags/75d9ab7d-268c-4e03-bb6c-180ca4b8d5ed.js";

type IdleWindow = typeof window & {
  requestIdleCallback?: (callback: (deadline: IdleDeadline) => void, opts?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function scheduleIdle(callback: () => void, delay: number) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const idleWin = window as IdleWindow;

  if (typeof idleWin.requestIdleCallback === "function") {
    const handle = idleWin.requestIdleCallback(() => callback(), { timeout: delay });
    return () => {
      idleWin.cancelIdleCallback?.(handle);
    };
  }

  const timeout = window.setTimeout(callback, delay);
  return () => {
    window.clearTimeout(timeout);
  };
}

export function JourneyAds({
  excludePrefix = "/admin",
  idleDelay = DEFAULT_IDLE_DELAY
}: JourneyAdsProps) {
  const pathname = usePathname();
  const [shouldLoad, setShouldLoad] = useState(false);
  const { requiresConsent, state, shouldShowBanner } = useConsent();

  const isBlockedRoute = useMemo(() => {
    if (!excludePrefix) return false;
    return Boolean(pathname && pathname.startsWith(excludePrefix));
  }, [pathname, excludePrefix]);

  const marketingAllowed = useMemo(() => {
    if (!requiresConsent) return true;
    if (shouldShowBanner) return false;
    return state.marketing;
  }, [requiresConsent, shouldShowBanner, state.marketing]);

  useEffect(() => {
    if (isBlockedRoute || !marketingAllowed) {
      return;
    }

    let cancelled = false;

    const cancel = scheduleIdle(() => {
      if (!cancelled) {
        setShouldLoad(true);
      }
    }, idleDelay);

    return () => {
      cancelled = true;
      cancel();
    };
  }, [idleDelay, isBlockedRoute, marketingAllowed]);

  useEffect(() => {
    if (!shouldLoad || !marketingAllowed) {
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-journey-src="${JOURNEY_SCRIPT_SRC}"]`
    );

    if (existing) {
      return;
    }

    const script = document.createElement("script");
    script.src = JOURNEY_SCRIPT_SRC;
    script.async = true;
    script.type = "text/javascript";
    script.setAttribute("data-noptimize", "1");
    script.setAttribute("data-cfasync", "false");
    script.setAttribute("data-journey-src", JOURNEY_SCRIPT_SRC);
    document.head.appendChild(script);

    return () => {
      // Keep the provider script mounted once loaded.
    };
  }, [shouldLoad, marketingAllowed]);

  return null;
}
