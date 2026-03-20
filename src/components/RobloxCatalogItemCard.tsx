"use client";

import { useState } from "react";
import Image from "next/image";

export type RobloxCatalogItemCardItem = {
  asset_id: number;
  item_type: string;
  name: string;
  category: string;
  subcategory: string;
  creator_name: string;
  favorite_count: number;
  price_robux: number;
  roblox_url: string;
  thumbnail_url: string | null;
};

type Props = {
  item: RobloxCatalogItemCardItem;
};

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function formatPrice(value: number): string {
  if (value === 0) return "Free";
  return `${formatCount(value)} Robux`;
}

function buildFallbackRobloxUrl(item: Pick<RobloxCatalogItemCardItem, "asset_id" | "item_type" | "roblox_url">): string {
  if (item.roblox_url) {
    return item.roblox_url;
  }

  if (item.item_type === "Bundle") {
    return `https://www.roblox.com/bundles/${Math.abs(Math.trunc(item.asset_id))}`;
  }

  return `https://www.roblox.com/catalog/${item.asset_id}`;
}

export function RobloxCatalogItemCard({ item }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasThumbnail = Boolean(item.thumbnail_url) && !imageFailed;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-surface shadow-soft transition duration-300 hover:-translate-y-0.5 hover:border-accent/80 hover:shadow-xl">
      <div className="flex flex-1 flex-col">
        <div className="relative aspect-square w-full overflow-hidden border-b border-border/60 bg-background/70">
          {hasThumbnail ? (
            <Image
              src={item.thumbnail_url!}
              alt={item.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-contain p-3 transition duration-500 group-hover:scale-[1.03]"
              onError={() => setImageFailed(true)}
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted/50" aria-hidden>
              <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="4.5" y="4.5" width="15" height="15" rx="3" />
                <path d="m8 15 2.6-2.6a1.4 1.4 0 0 1 2 0L16 15" />
                <path d="M9 9.5h.01" />
              </svg>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background/85 via-background/25 to-transparent" />
          <div className="absolute left-2 top-2">
            <div className="inline-flex rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-sm">
              {formatPrice(item.price_robux)}
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-3">
          <div>
            <h2 className="text-sm font-semibold leading-4 text-foreground line-clamp-2">{item.name}</h2>
            <p className="-mt-0.5 block truncate text-xs leading-none text-muted">
              by <span className="font-semibold text-foreground">{item.creator_name}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-full border border-border/60 bg-background/50 px-2.5 py-1 text-[10px] font-medium text-foreground/85">
              {item.category}
            </span>
            <span className="inline-flex items-center rounded-full border border-border/60 bg-background/50 px-2.5 py-1 text-[10px] font-medium text-foreground/85">
              {item.subcategory}
            </span>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Favorites</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background/70 text-foreground/80">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                  <path d="m12 17.27 5.18 3.05-1.38-5.89 4.58-3.97-6.03-.51L12 4.4 9.65 9.95l-6.03.51 4.58 3.97-1.38 5.89L12 17.27Z" />
                </svg>
              </span>
              <p className="text-base font-semibold leading-none text-foreground">{formatCount(item.favorite_count)}</p>
            </div>
          </div>

          <div className="mt-auto">
            <a
              href={buildFallbackRobloxUrl(item)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:bg-accent-dark dark:bg-accent-dark dark:hover:bg-accent"
            >
              Open on Roblox
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
