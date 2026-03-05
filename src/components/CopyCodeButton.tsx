"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

type Tone = "accent" | "surface";
type Size = "sm" | "md";

type Props = {
  code: string;
  tone?: Tone;
  size?: Size;
  onCopySuccess?: () => void;
  analytics?: {
    event: string;
    params?: Record<string, string | number | boolean>;
  };
};

export function CopyCodeButton({ code, tone = "surface", size = "md", onCopySuccess, analytics }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      onCopySuccess?.();
      if (analytics) {
        trackEvent(analytics.event, analytics.params);
      }
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed", err);
    }
  }

  const baseClass = size === "sm"
    ? "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    : "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

  const toneClass = tone === "accent"
    ? "border border-accent/40 bg-accent/15 text-accent shadow-soft hover:border-accent/60 hover:bg-accent/20"
    : "border border-border/40 bg-surface text-foreground hover:border-border/30";

  const copiedClass = tone === "accent"
    ? "border border-accent/60 bg-accent-dark text-white"
    : "border border-border/40 bg-surface-muted text-foreground";

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`${baseClass} ${copied ? copiedClass : toneClass}`}
      aria-label={`Copy code ${code}`}
    >
      <svg
        aria-hidden
        className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        {copied ? (
          <path d="m5 13 4 4L19 7" />
        ) : (
          <>
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8" />
          </>
        )}
      </svg>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
