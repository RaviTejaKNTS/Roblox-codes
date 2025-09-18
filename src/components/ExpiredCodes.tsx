"use client";

import { useEffect, useState } from "react";

type ExpiredCode = {
  id: string;
  code: string;
};

export function ExpiredCodes({ codes }: { codes: ExpiredCode[] }) {
  const [expanded, setExpanded] = useState(false);
  const [initialCount, setInitialCount] = useState(4);

  useEffect(() => {
    function computeCount(width: number) {
      if (width >= 768) return 8;
      if (width >= 640) return 6;
      return 4;
    }

    function update() {
      const next = computeCount(window.innerWidth);
      setInitialCount((prev) => (prev === next ? prev : next));
    }

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const sorted = [...codes].reverse();
  const baseLimit = Math.min(initialCount, sorted.length);
  const limit = expanded ? sorted.length : baseLimit;
  const visible = sorted.slice(0, limit);
  const hasOverflow = sorted.length > baseLimit;
  const label = expanded ? "Show less" : "Show more";
  const iconRotation = expanded ? "-rotate-180" : "";

  return (
    <div className="space-y-3">
      <ul className="mt-3 grid grid-cols-2 gap-2 text-xs text-foreground/80 sm:grid-cols-3 md:grid-cols-4">
        {visible.map((c) => (
          <li key={c.id} className="rounded-full border border-border/40 bg-surface-muted/70 px-3 py-1 text-center font-medium text-muted">
            <code>{c.code}</code>
          </li>
        ))}
      </ul>
      {hasOverflow ? (
        <button
          type="button"
          className="inline-flex items-center gap-2 text-sm font-semibold text-accent transition hover:text-accent-dark"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <span>{label}</span>
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border border-accent/30 bg-accent/10 transition-transform ${iconRotation}`}>
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5 text-accent"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </span>
        </button>
      ) : null}
    </div>
  );
}
