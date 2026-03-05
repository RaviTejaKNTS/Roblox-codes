"use client";

import { useEffect, useMemo, useState } from "react";

import { buildCountdown } from "./eventTimeFormat";

type EventCountdownProps = {
  startUtc: string | null;
  thumbnailUrl?: string | null;
  eventName: string;
  initialLabel?: string | null;
};

export function EventCountdown({
  startUtc,
  thumbnailUrl,
  eventName,
  initialLabel
}: EventCountdownProps) {
  const target = useMemo(() => {
    if (!startUtc) return null;
    const parsed = new Date(startUtc);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  }, [startUtc]);

  const fallbackLabel = "Countdown unavailable.";
  const [label, setLabel] = useState(() => initialLabel ?? fallbackLabel);

  useEffect(() => {
    if (!target) {
      setLabel(fallbackLabel);
      return;
    }
    const tick = () => setLabel(buildCountdown(target, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!target) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-surface-muted/60 p-4">
        <div className="article-content prose dark:prose-invert game-copy max-w-none">
          <p>{fallbackLabel}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-border/60 bg-surface-muted lg:max-w-[50%]">
      {thumbnailUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${thumbnailUrl})` }}
        />
      ) : (
        <div className="absolute inset-0 bg-black" />
      )}
      <div className="absolute inset-0 bg-white/80 dark:bg-black/80" />
      <div className="relative z-10 flex h-full items-center justify-center p-6 text-center">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-foreground/80 dark:text-white/80">
            {eventName}
          </p>
          <p className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl dark:text-white">
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}
