"use client";

import Link from "next/link";
import { useConsent } from "@/components/consent/ConsentProvider";
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";

export function CookieSettingsContent() {
  const { state, acceptAll, rejectAll, updateConsent, requiresConsent } = useConsent();
  const [analytics, setAnalytics] = useState(state.analytics);
  const [marketing, setMarketing] = useState(state.marketing);

  useEffect(() => {
    setAnalytics(state.analytics);
    setMarketing(state.marketing);
  }, [state.analytics, state.marketing]);

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
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Privacy</p>
        <h1 className="text-3xl font-bold">Cookie settings</h1>
        <p className="text-muted-foreground">
          Control which non-essential cookies and scripts we run. Necessary cookies stay on to keep the site working.
          {requiresConsent ? " We detected that consent is required for your region." : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleAcceptAll}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 sm:w-auto"
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
          onClick={saveChoices}
          className="w-full rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted sm:w-auto"
        >
          Save choices
        </button>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-5">
        <div className="flex items-start gap-3">
          <div className="h-5 w-5 rounded-full border border-border bg-background" aria-hidden />
          <div>
            <p className="font-semibold">Necessary</p>
            <p className="text-sm text-muted-foreground">Always on to keep the site running (no ads/analytics).</p>
          </div>
        </div>

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
          <div>
            <p className="font-semibold">Analytics</p>
            <p className="text-sm text-muted-foreground">
              Helps us measure usage (Google Analytics).
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
          <div>
            <p className="font-semibold">Ads/marketing</p>
            <p className="text-sm text-muted-foreground">Used for ads if enabled (Mediavine Journey).</p>
          </div>
        </label>
      </div>

      <div className="text-sm text-muted-foreground">
        <p>
          Need more details? Read our{" "}
          <Link href="/privacy-policy" className="text-primary underline-offset-4 hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
