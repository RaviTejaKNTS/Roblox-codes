"use client";

type ContentSlotProps = {
  slot: string;
  clientId?: string;
  className?: string;
  minHeight?: number | string;
  rootMargin?: string;
  adLayout?: string | null;
  adLayoutKey?: string;
  adFormat?: string;
  fullWidthResponsive?: boolean;
  textAlign?: "left" | "center" | "right" | "start" | "end";
  collapseOnUnfilled?: boolean;
  collapseAfterMs?: number;
};

export function ContentSlot(_props: ContentSlotProps) {
  return null;
}
