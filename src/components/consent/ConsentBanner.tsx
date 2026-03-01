"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { useConsent } from "./ConsentProvider";

export function ConsentBanner() {
  const { shouldShowBanner, requiresConsent, acceptAll, rejectAll, updateConsent, state } = useConsent();
  const [showOptions, setShowOptions] = useState(false);
  const [analytics, setAnalytics] = useState(state.analytics);
  const [marketing, setMarketing] = useState(state.marketing);

  useEffect(() => {
    setAnalytics(state.analytics);
    setMarketing(state.marketing);
  }, [state.analytics, state.marketing]);

  if (!requiresConsent || !shouldShowBanner) {
    return null;
  }

  const saveChoices = () => {
    updateConsent({ analytics, marketing });
    trackEvent("consent_update", { action: "save_choices", analytics, marketing });
  };

  const handleAcceptAll = () => {
    acceptAll();
    trackEvent("consent_update", { action: "accept_all", analytics: true, marketing: true });
  };

  const handleRejectAll = () => {
    rejectAll();
    trackEvent("consent_update", { action: "reject_all", analytics: false, marketing: false });
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[95vw] max-w-lg rounded-xl border border-border bg-background p-4 shadow-2xl sm:w-[440px]">
      <div className="flex flex-col gap-3 text-sm leading-6">
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold">We use cookies</p>
          <p className="text-muted-foreground">
            In GDPR regions we only run analytics and ads after you accept. Necessary cookies always stay on.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAcceptAll}
            className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 sm:w-auto"
          >
            Accept all
          </button>
          <button
            type="button"
            onClick={handleRejectAll}
            className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 sm:w-auto"
          >
            Reject non-essential
          </button>
          <button
            type="button"
            onClick={() => setShowOptions((open) => !open)}
            className="rounded-md px-3 py-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            {showOptions ? "Hide options" : "Manage choices"}
          </button>
          <Link
            href="/privacy-policy"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Privacy policy
          </Link>
        </div>

        {showOptions ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/40 p-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={analytics}
                onChange={(e) => {
                  const next = e.target.checked;
                  setAnalytics(next);
                  trackEvent("consent_update", { action: "toggle_analytics", analytics: next, marketing });
                }}
              />
              <div className="text-sm">
                <p className="font-semibold">Analytics</p>
                <p className="text-muted-foreground">
                  Helps us understand site usage (Google Analytics).
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={marketing}
                onChange={(e) => {
                  const next = e.target.checked;
                  setMarketing(next);
                  trackEvent("consent_update", { action: "toggle_marketing", analytics, marketing: next });
                }}
              />
              <div className="text-sm">
                <p className="font-semibold">Ads/marketing</p>
                <p className="text-muted-foreground">Used if we show ads (Mediavine Journey).</p>
              </div>
            </label>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={saveChoices}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                Save choices
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
