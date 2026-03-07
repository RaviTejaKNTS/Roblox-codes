"use client";

import { useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { ColorCodeCard, type ColorCodeItem } from "./ColorCodesGrid";

type Props = {
  items: ColorCodeItem[];
};

type HSV = {
  h: number;
  s: number;
  v: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function hsvToRgb({ h, s, v }: HSV): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 1);
  const value = clamp(v, 0, 1);
  const c = value * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - c;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

function rgbToHsv([r, g, b]: [number, number, number]): HSV {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6);
    else if (max === green) h = 60 * ((blue - red) / delta + 2);
    else h = 60 * ((red - green) / delta + 4);
  }

  return {
    h: h < 0 ? h + 360 : h,
    s: max === 0 ? 0 : delta / max,
    v: max
  };
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

export function HexColorPicker({ items }: Props) {
  const [hsv, setHsv] = useState<HSV>({ h: 145, s: 0.024, v: 0.647 });
  const [copiedField, setCopiedField] = useState<"hex" | "rgb" | "hsv" | null>(null);
  const saturationRef = useRef<HTMLDivElement | null>(null);
  const hueRef = useRef<HTMLDivElement | null>(null);
  const rgb = useMemo(() => hsvToRgb(hsv), [hsv]);
  const normalizedHex = rgbToHex(rgb);
  const closest = useMemo(() => findClosestColor(items, rgb), [items, rgb]);
  const pureHue = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
  const rgbValue = rgb.join(", ");
  const hsvValue = `${Math.round(hsv.h)}, ${Math.round(hsv.s * 100)}%, ${Math.round(hsv.v * 100)}%`;

  function updateSaturationValue(clientX: number, clientY: number) {
    const element = saturationRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((clientY - rect.top) / rect.height, 0, 1);
    setHsv((current) => ({ ...current, s: x, v: 1 - y }));
  }

  function updateHue(clientX: number) {
    const element = hueRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    setHsv((current) => ({ ...current, h: x * 360 }));
  }

  function beginDrag(
    event: React.PointerEvent<HTMLDivElement>,
    updater: (clientX: number, clientY: number) => void
  ) {
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    updater(event.clientX, event.clientY);

    const move = (moveEvent: PointerEvent) => updater(moveEvent.clientX, moveEvent.clientY);
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };

    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  }

  function handleHexInputChange(value: string) {
    const normalized = normalizeHex(value);
    if (!normalized) return;
    const nextRgb = hexToRgb(normalized);
    if (!nextRgb) return;
    setHsv(rgbToHsv(nextRgb));
  }

  async function handleCopy(field: "hex" | "rgb" | "hsv", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      trackEvent("color_picker_copy", {
        copy_field: field,
        hex: normalizedHex
      });
      window.setTimeout(() => {
        setCopiedField((current) => (current === field ? null : current));
      }, 1800);
    } catch (error) {
      console.error("Failed to copy color picker value", error);
    }
  }

  return (
    <section className="rounded-[1.75rem] border border-border/60 bg-gradient-to-br from-surface via-surface/95 to-background p-4 shadow-soft">
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(17rem,0.9fr)] lg:items-stretch">
          <div className="rounded-2xl border border-border/60 bg-background/70 p-4 lg:h-full">
            <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
              <div className="flex flex-col items-center gap-3 text-center">
                <div
                  className="h-20 w-20 shrink-0 rounded-2xl border border-border/50 shadow-inner"
                  style={{ backgroundColor: normalizedHex }}
                />
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Selected color</p>
              </div>

              <div className="grid gap-2 sm:min-w-0">
                <button
                  type="button"
                  onClick={() => handleCopy("hex", normalizedHex)}
                  className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/60 bg-surface/70 px-4 py-3 text-left transition hover:border-accent/40 hover:bg-surface focus:outline-none focus-visible:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/20"
                  aria-label={`Copy hex value: ${normalizedHex}`}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Hex</span>
                  <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-foreground">
                    {normalizedHex}
                  </span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted transition hover:text-foreground">
                    {copiedField === "hex" ? "Copied" : "Copy"}
                  </span>
                </button>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => handleCopy("rgb", rgbValue)}
                    className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/60 bg-surface/70 px-4 py-3 text-left transition hover:border-accent/40 hover:bg-surface focus:outline-none focus-visible:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/20"
                    aria-label={`Copy RGB value: ${rgbValue}`}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">RGB</span>
                    <p className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-foreground">{rgbValue}</p>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted transition hover:text-foreground">
                      {copiedField === "rgb" ? "Copied" : "Copy"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy("hsv", hsvValue)}
                    className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/60 bg-surface/70 px-4 py-3 text-left transition hover:border-accent/40 hover:bg-surface focus:outline-none focus-visible:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/20"
                    aria-label={`Copy HSV value: ${hsvValue}`}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">HSV</span>
                    <p className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-foreground">{hsvValue}</p>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted transition hover:text-foreground">
                      {copiedField === "hsv" ? "Copied" : "Copy"}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              <div
                ref={saturationRef}
                role="slider"
                tabIndex={0}
                aria-label="Saturation and brightness"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(hsv.s * 100)}
                className="relative h-52 cursor-crosshair overflow-hidden rounded-2xl border border-border/50"
                style={{ backgroundColor: pureHue }}
                onPointerDown={(event) => beginDrag(event, updateSaturationValue)}
              >
                <div className="absolute inset-0 bg-[linear-gradient(90deg,#fff,rgba(255,255,255,0))]" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0),#000)]" />
                <div
                  className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(8,18,37,0.25)]"
                  style={{
                    left: `${hsv.s * 100}%`,
                    top: `${(1 - hsv.v) * 100}%`
                  }}
                />
              </div>

              <div
                ref={hueRef}
                role="slider"
                tabIndex={0}
                aria-label="Hue"
                aria-valuemin={0}
                aria-valuemax={360}
                aria-valuenow={Math.round(hsv.h)}
                className="relative h-3.5 cursor-ew-resize rounded-full border border-border/50"
                style={{
                  background:
                    "linear-gradient(90deg,#FF0000 0%,#FFFF00 17%,#00FF00 33%,#00FFFF 50%,#0000FF 67%,#FF00FF 83%,#FF0000 100%)"
                }}
                onPointerDown={(event) =>
                  beginDrag(event, (clientX) => {
                    updateHue(clientX);
                  })
                }
              >
                <div
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-transparent shadow-[0_0_0_1px_rgba(8,18,37,0.25)]"
                  style={{ left: `${(hsv.h / 360) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 lg:h-full">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Closest Roblox BrickColor
            </p>
            {closest ? (
              <ColorCodeCard item={closest} compact />
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/70 p-6 text-sm text-muted">
                No color data available.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
