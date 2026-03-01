"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { useConsent } from "./consent/ConsentProvider";

type JourneyAdsProps = {
  excludePrefix?: string;
};

const JOURNEY_SCRIPT_SRC = "//scripts.scriptwrapper.com/tags/75d9ab7d-268c-4e03-bb6c-180ca4b8d5ed.js";

export function JourneyAds({
  excludePrefix = "/admin"
}: JourneyAdsProps) {
  const pathname = usePathname();
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

  if (isBlockedRoute || !marketingAllowed) {
    return null;
  }

  return (
    <Script
      id="journey-ads"
      src={JOURNEY_SCRIPT_SRC}
      strategy="afterInteractive"
      type="text/javascript"
      async
      data-noptimize="1"
      data-cfasync="false"
    />
  );
}
