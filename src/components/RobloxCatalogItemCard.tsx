"use client";

import Image from "next/image";
import { CopyCodeButton } from "@/components/CopyCodeButton";

export type RobloxCatalogItemCardItem = {
  asset_id: number;
  name: string;
  category: string;
  subcategory: string;
  creator_name: string;
  favorite_count: number;
  price_robux: number;
};

type Props = {
  item: RobloxCatalogItemCardItem;
};

function buildThumbnailUrl(assetId: number): string {
  return `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=420&height=420&format=png`;
}

function buildRobloxUrl(assetId: number): string {
  return `https://www.roblox.com/catalog/${assetId}`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function formatPrice(value: number): string {
  if (value === 0) return "Free";
  return `${formatCount(value)} Robux`;
}

export function RobloxCatalogItemCard({ item }: Props) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-soft transition duration-300 hover:-translate-y-1 hover:border-accent hover:shadow-xl">
      <div className="flex flex-1 flex-col">
        <div className="relative aspect-square w-full overflow-hidden border-b border-border/60 bg-background/60">
          <Image
            src={buildThumbnailUrl(item.asset_id)}
            alt={item.name}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover transition duration-500 group-hover:scale-105"
            unoptimized
          />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/90 via-background/35 to-transparent" />
          <div className="absolute left-3 top-3">
            <div className="inline-flex rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              {formatPrice(item.price_robux)}
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold leading-snug text-foreground line-clamp-2">{item.name}</h2>
            <p className="text-sm text-muted line-clamp-1">
              by <span className="font-semibold text-foreground">{item.creator_name}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Category</p>
              <p className="mt-1 font-semibold text-foreground line-clamp-1">{item.category}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Subcategory</p>
              <p className="mt-1 font-semibold text-foreground line-clamp-1">{item.subcategory}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Favorites</p>
              <p className="mt-1 font-semibold text-foreground">{formatCount(item.favorite_count)}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Item ID</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="font-mono text-[0.82rem] font-semibold text-foreground">{item.asset_id}</span>
                <CopyCodeButton
                  code={String(item.asset_id)}
                  tone="surface"
                  size="sm"
                  analytics={{
                    event: "free_item_copy",
                    params: {
                      asset_id: item.asset_id,
                      category: item.category,
                      subcategory: item.subcategory
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mt-auto">
            <a
              href={buildRobloxUrl(item.asset_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-accent-dark dark:bg-accent-dark dark:hover:bg-accent"
            >
              Open on Roblox
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
