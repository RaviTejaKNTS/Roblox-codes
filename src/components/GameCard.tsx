import Image from "next/image";
import Link from "next/link";
import type { GameWithCounts } from "@/lib/db";

const baseCardClass = "group overflow-hidden rounded-[var(--radius-lg)] border border-border/60 bg-surface transition-colors flex flex-col";

type GameCardProps = {
  game: GameWithCounts;
  className?: string;
};

export function GameCard({ game, className }: GameCardProps) {
  const classes = className ? `${baseCardClass} ${className}` : baseCardClass;

  return (
    <Link
      href={`/${game.slug}`}
      className={`${classes} hover:border-accent hover:shadow-[0_24px_45px_-35px_rgba(59,70,128,0.65)]`}
    >
      <div className="relative aspect-[16/9] bg-surface-muted">
        {game.cover_image ? (
          <Image
            src={game.cover_image}
            alt={game.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted">{game.name}</div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="font-semibold text-lg text-foreground group-hover:text-accent">{game.name} Codes</h2>
        <p className="text-xs text-muted flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-green-400" aria-hidden />
          {game.active_count} {game.active_count === 1 ? "active code" : "active codes"}
        </p>
      </div>
    </Link>
  );
}
