"use client";

import dynamic from "next/dynamic";

const GlobalSearchOverlay = dynamic(
  () =>
    import("@/components/GlobalSearchOverlay").then((mod) => ({
      default: mod.GlobalSearchOverlay
    })),
  { ssr: false, loading: () => null }
);

export function LayoutGlobalSearch() {
  return <GlobalSearchOverlay />;
}
