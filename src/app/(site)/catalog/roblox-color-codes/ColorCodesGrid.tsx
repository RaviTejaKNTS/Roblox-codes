"use client";

import { useMemo, useState } from "react";
import { trackEvent } from "@/lib/analytics";

export type ColorCodeItem = {
  name: string;
  slug: string;
  number: number;
  hex: string;
  rgb255: string;
  rgb255Channels: [number, number, number];
  rgb01: string;
  rgb01Channels: [number, number, number];
  sortOrder: number;
};

type Props = {
  items: ColorCodeItem[];
};

type CopyField = {
  key: "name" | "number" | "rgb255" | "rgb01" | "hex";
  label: string;
  shortLabel: string;
  value: string;
};

function luminance([r, g, b]: [number, number, number]) {
  const [rs, gs, bs] = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getTextColors(rgb: [number, number, number]) {
  const isLight = luminance(rgb) > 0.62;
  return {
    primary: isLight ? "#081225" : "#FFFFFF",
    secondary: isLight ? "rgba(8, 18, 37, 0.72)" : "rgba(255, 255, 255, 0.8)"
  };
}

function buildCopyRows(item: ColorCodeItem): CopyField[] {
  return [
    { key: "name", label: "Copy name", shortLabel: "Name", value: item.name },
    { key: "number", label: "Copy number", shortLabel: "Number", value: String(item.number) },
    { key: "rgb255", label: "Copy RGB 0-255", shortLabel: "RGB", value: item.rgb255 }
  ];
}

function normalizeHex(value: string): string {
  const cleaned = value.trim().replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{6}$/.test(cleaned)) return `#${cleaned}`;
  if (/^[0-9A-F]{3}$/.test(cleaned)) {
    return `#${cleaned
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`;
  }
  return "";
}

function parseRgbQuery(value: string): [number, number, number] | null {
  const cleaned = value.trim().replace(/^rgb\s*\(/i, "").replace(/\)$/i, "");
  const parts = cleaned.split(/[,\s]+/).filter(Boolean);
  if (parts.length !== 3) return null;

  const channels = parts.map((part) => Number(part));
  if (channels.some((channel) => Number.isNaN(channel) || channel < 0 || channel > 255)) return null;

  return channels as [number, number, number];
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const raw = normalized.slice(1);
  return [
    Number.parseInt(raw.slice(0, 2), 16),
    Number.parseInt(raw.slice(2, 4), 16),
    Number.parseInt(raw.slice(4, 6), 16)
  ];
}

function distance(a: [number, number, number], b: [number, number, number]) {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 +
    (a[1] - b[1]) ** 2 +
    (a[2] - b[2]) ** 2
  );
}

function findClosestColor(items: ColorCodeItem[], rgb: [number, number, number]) {
  let closest = items[0] ?? null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const item of items) {
    const itemDistance = distance(rgb, item.rgb255Channels);
    if (itemDistance < closestDistance) {
      closest = item;
      closestDistance = itemDistance;
    }
  }

  return closest;
}

function parseColorQuery(value: string): [number, number, number] | null {
  return hexToRgb(value) ?? parseRgbQuery(value);
}

export function ColorCodeCard({
  item,
  compact = false,
  className = ""
}: {
  item: ColorCodeItem;
  compact?: boolean;
  className?: string;
}) {
  const [copiedKey, setCopiedKey] = useState<CopyField["key"] | null>(null);
  const textColors = getTextColors(item.rgb255Channels);
  const copyRows = buildCopyRows(item);

  async function handleCopy(field: CopyField) {
    try {
      await navigator.clipboard.writeText(field.value);
      setCopiedKey(field.key);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      trackEvent("color_code_copy", {
        color_name: item.name,
        color_number: item.number,
        copy_field: field.key
      });
      window.setTimeout(() => {
        setCopiedKey((current) => (current === field.key ? null : current));
      }, 1800);
    } catch (error) {
      console.error("Failed to copy color code", error);
    }
  }

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border border-border/60 shadow-soft transition duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-xl ${
        compact ? "h-[21rem]" : "h-[18rem]"
      } ${className}`}
    >
      <div className="absolute inset-0" style={{ backgroundColor: item.hex }} />
      <div className="absolute inset-0 bg-black/0 transition duration-300 group-hover:bg-black/5" />

      <div
        className={`relative flex h-full flex-col justify-end transition duration-200 group-hover:opacity-0 group-hover:blur-[1px] ${
          compact ? "p-4" : "p-4 md:p-5"
        }`}
      >
        <div className="ml-auto flex max-w-[90%] flex-col items-end gap-1.5 text-right">
          <h2
            className={`break-words font-semibold leading-[0.96] tracking-[-0.04em] ${
              compact ? "text-[1.45rem] md:text-[1.6rem]" : "text-[1.45rem] md:text-[1.65rem]"
            }`}
            style={{ color: textColors.primary }}
          >
            {item.name}
          </h2>

          <div className="space-y-0.5">
            <p
              className={`${compact ? "text-[10px]" : "text-[10px]"} font-semibold uppercase tracking-[0.2em]`}
              style={{ color: textColors.secondary }}
            >
              Number
            </p>
            <p
              className={`${compact ? "text-[1.55rem]" : "text-[1.55rem] md:text-[1.7rem]"} font-semibold leading-none tracking-[-0.03em]`}
              style={{ color: textColors.primary }}
            >
              {item.number}
            </p>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-20 rounded-2xl opacity-0 transition duration-200 group-hover:opacity-100">
        <div className="absolute inset-0 rounded-2xl bg-[rgba(34,78,154,0.62)]" />
        <div className="absolute inset-0 rounded-2xl ring-1 ring-white/10" />

        <div className={`pointer-events-auto relative flex h-full flex-col ${compact ? "p-3" : "p-3"}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/20" style={{ backgroundColor: item.hex }} />
              <p
                className="truncate text-[10px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: textColors.secondary }}
              >
                Quick copy
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCopy({ key: "hex", label: "Copy hex", shortLabel: "Hex", value: item.hex })}
              className={`max-w-[46%] rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition focus:outline-none focus-visible:border-white/60 focus-visible:ring-2 focus-visible:ring-white/15 ${
                copiedKey === "hex"
                  ? "border-white/30 bg-white/18 text-white"
                  : "border-white/16 bg-[rgba(8,18,37,0.28)] text-white/88 hover:bg-[rgba(8,18,37,0.38)]"
              }`}
              aria-label={`Copy hex: ${item.hex}`}
            >
              <span className="block truncate" style={{ color: textColors.primary }}>
                {copiedKey === "hex" ? "Copied" : item.hex}
              </span>
            </button>
          </div>

          <div className="grid flex-1 auto-rows-fr gap-2">
            {copyRows.map((field) => (
              <button
                key={field.key}
                type="button"
                onClick={() => handleCopy(field)}
                className={`flex min-w-0 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition focus:outline-none focus-visible:border-white/60 focus-visible:ring-2 focus-visible:ring-white/15 ${
                  copiedKey === field.key
                    ? "border-white/30 bg-white/16"
                    : "border-white/12 bg-white/[0.08] hover:bg-white/[0.12]"
                }`}
                aria-label={`${field.label}: ${field.value}`}
              >
                <span
                  className="block text-[9px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: textColors.secondary }}
                >
                  {copiedKey === field.key ? "Copied" : field.shortLabel}
                </span>
                <span
                  className={`mt-1 block w-full font-semibold leading-tight ${
                    field.key === "name"
                      ? "line-clamp-2 text-[0.92rem]"
                      : field.key === "number"
                        ? "text-[1rem]"
                        : "line-clamp-2 font-mono text-[0.8rem]"
                  }`}
                  style={{ color: textColors.primary }}
                >
                  {field.value}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

export function ColorCodesGrid({ items }: Props) {
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const parsedColor = useMemo(() => parseColorQuery(trimmedQuery), [trimmedQuery]);
  const closestMatch = useMemo(
    () => (parsedColor ? findClosestColor(items, parsedColor) : null),
    [items, parsedColor]
  );
  const filteredItems = useMemo(() => {
    if (!trimmedQuery) return items;
    if (parsedColor) return closestMatch ? [closestMatch] : [];

    const normalizedQuery = trimmedQuery.toLowerCase();
    return items.filter((item) => {
      return [
        item.name.toLowerCase(),
        item.slug.toLowerCase(),
        String(item.number),
        item.hex.toLowerCase(),
        item.rgb255.toLowerCase(),
        item.rgb01.toLowerCase()
      ].some((value) => value.includes(normalizedQuery));
    });
  }, [closestMatch, items, parsedColor, trimmedQuery]);

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-surface/60 p-8 text-center text-muted">
        No Roblox color codes are available yet. Check back soon.
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by name, number, hex, or RGB"
        className="w-full rounded-2xl border border-border/60 bg-background px-4 py-3 text-base text-foreground outline-none transition placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/15"
        aria-label="Search Roblox color codes"
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {filteredItems.map((item) => (
          <ColorCodeCard key={item.number} item={item} />
        ))}
      </div>

      {trimmedQuery && !filteredItems.length ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-surface/60 p-8 text-center text-muted">
          No Roblox colors matched that search.
        </div>
      ) : null}
    </section>
  );
}
