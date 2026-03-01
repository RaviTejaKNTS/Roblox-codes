"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConsent } from "@/components/consent/ConsentProvider";

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

const DEFAULT_MIN_HEIGHT = 250;
const DEFAULT_ROOT_MARGIN = "600px 0px";

export function ContentSlot({
  slot,
  className,
  minHeight = DEFAULT_MIN_HEIGHT,
  rootMargin = DEFAULT_ROOT_MARGIN
}: ContentSlotProps) {
  const { requiresConsent, state, shouldShowBanner } = useConsent();
  const [isMounted, setIsMounted] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const marketingAllowed = useMemo(() => {
    if (!requiresConsent) return true;
    if (shouldShowBanner) return false;
    return state.marketing;
  }, [requiresConsent, shouldShowBanner, state.marketing]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    const container = containerRef.current;
    if (!container || isInView) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [isMounted, isInView, rootMargin]);

  const shouldRender = isMounted && marketingAllowed && isInView;

  if (!isMounted || !marketingAllowed) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{ minHeight: 1 }}
      />
    );
  }

  const slotStyle = shouldRender
    ? {
        minHeight,
        width: "100%"
      }
    : { minHeight: 1 };

  return (
    <div ref={containerRef} className={className} style={slotStyle}>
      {shouldRender ? (
        <div
          data-ad-slot={slot}
          data-ad-provider="journey"
          style={{ minHeight, width: "100%" }}
        />
      ) : null}
    </div>
  );
}
