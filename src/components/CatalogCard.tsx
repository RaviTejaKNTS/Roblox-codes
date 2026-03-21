import Image from "next/image";
import Link from "next/link";

const TONE_STYLES = {
  indigo: {
    chip: "border-accent/30 bg-accent/10 text-accent",
    ring: "border-accent/20",
    text: "text-accent",
    dot: "bg-accent",
    glow: "bg-gradient-to-br from-accent/25 via-transparent to-transparent"
  },
  emerald: {
    chip: "border-emerald-400/30 bg-emerald-500/10 text-emerald-600",
    ring: "border-emerald-400/30",
    text: "text-emerald-600",
    dot: "bg-emerald-400",
    glow: "bg-gradient-to-br from-emerald-400/25 via-transparent to-transparent"
  },
  amber: {
    chip: "border-amber-400/30 bg-amber-400/15 text-amber-600",
    ring: "border-amber-400/30",
    text: "text-amber-600",
    dot: "bg-amber-400",
    glow: "bg-gradient-to-br from-amber-400/30 via-transparent to-transparent"
  }
} as const;

type Tone = keyof typeof TONE_STYLES;

type CatalogCardProps = {
  href: string;
  title: string;
  description: string;
  category: string;
  metricLabel?: string | null;
  metricValue?: number | null;
  updatedLabel?: string | null;
  coverImage?: string | null;
  tileLabel?: string | null;
  tone?: Tone;
};

function normalizeImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("http")) return value;
  return value.startsWith("/") ? value : `/${value}`;
}

function formatMetricValue(value: number | null | undefined) {
  if (typeof value !== "number") return "--";
  return value.toLocaleString("en-US");
}

export function CatalogCard({
  href,
  title,
  description,
  category,
  metricLabel,
  metricValue,
  updatedLabel,
  coverImage,
  tileLabel,
  tone = "indigo"
}: CatalogCardProps) {
  const toneStyles = TONE_STYLES[tone] ?? TONE_STYLES.indigo;
  const normalizedCover = normalizeImageUrl(coverImage);
  const tileText = (tileLabel ?? category).slice(0, 10);
  const formattedValue = formatMetricValue(metricValue);
  const showMetric = typeof metricValue === "number" && typeof metricLabel === "string" && metricLabel.trim().length > 0;

  return (
    <Link href={href} className="group block h-full">
      <article className="relative flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border/70 bg-gradient-to-br from-surface to-background shadow-soft transition duration-300 hover:-translate-y-1 hover:border-accent/70 hover:shadow-xl">
        <div
          className={`pointer-events-none absolute -right-10 top-[-20px] h-44 w-44 rounded-full ${toneStyles.glow} blur-3xl`}
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(255,255,255,0.35),transparent_45%)]" aria-hidden />

        <div className="relative flex flex-1 flex-col gap-4 p-5">
          <div className="flex items-start gap-4">
            <div className={`relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border ${toneStyles.ring} bg-background/70 shadow-inner`}>
              {normalizedCover ? (
                <Image
                  src={normalizedCover}
                  alt={title}
                  fill
                  sizes="80px"
                  className="object-cover transition duration-500 group-hover:scale-105"
                />
              ) : (
                <div className={`flex h-full w-full items-center justify-center px-2 text-center text-[11px] font-semibold uppercase tracking-[0.2em] ${toneStyles.text}`}>
                  {tileText}
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent" />
            </div>

            <div className="min-w-0 space-y-2">
              <h3 className="text-xl font-semibold leading-snug text-foreground transition group-hover:text-accent line-clamp-2">
                {title}
              </h3>
              <p className="text-sm text-muted line-clamp-2">{description}</p>
            </div>
          </div>

          {showMetric ? (
            <div className={`flex flex-wrap items-end justify-between gap-4 rounded-2xl border ${toneStyles.ring} bg-background/60 px-4 py-3`}>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">Catalog size</p>
                <p className="text-3xl font-semibold text-foreground">{formattedValue}</p>
              </div>
              <div className="text-right">
                <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${toneStyles.text}`}>{metricLabel}</p>
              </div>
            </div>
          ) : updatedLabel ? (
            <div className={`flex items-center gap-2 rounded-2xl border ${toneStyles.ring} bg-background/60 px-4 py-3 text-sm text-muted`}>
              <span className={`h-2 w-2 rounded-full ${toneStyles.dot}`} aria-hidden />
              <span>Updated {updatedLabel}</span>
            </div>
          ) : null}
        </div>
      </article>
    </Link>
  );
}
