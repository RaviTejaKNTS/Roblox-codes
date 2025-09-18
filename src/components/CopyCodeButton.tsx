"use client";

import { useState } from "react";

type Tone = "accent" | "surface";

type Props = {
  code: string;
  tone?: Tone;
};

export function CopyCodeButton({ code, tone = "surface" }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed", err);
    }
  }

  const baseClass = "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

  const toneClass = tone === "accent"
    ? "border border-[#d7dcf5] bg-[#f1f3fc] text-[#202234] shadow-soft hover:border-[#c1c7ef] hover:bg-[#e6e9f8] dark:border-[#2a2c44] dark:bg-[#202234] dark:text-white dark:hover:border-[#35385a] dark:hover:bg-[#262845]"
    : "border border-border/40 bg-surface text-foreground hover:border-border/30";

  const copiedClass = tone === "accent"
    ? "border border-[#cbd1f0] bg-[#e6e9f8] text-[#1b2337] dark:border-[#494d76] dark:bg-[#303358] dark:text-white"
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
        className="h-3.5 w-3.5"
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
