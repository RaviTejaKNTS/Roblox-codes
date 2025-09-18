import { listGamesWithActiveCounts } from "@/lib/db";
import { monthYear } from "@/lib/date";
import { GameSearch } from "@/components/GameSearch";

export const revalidate = 300;

export const metadata = {
  title: `Bloxodes (${monthYear()})`,
  description: "Active & expired Roblox game codes. Browse games and find working codes with rewards.",
};

export default async function HomePage() {
  const games = await listGamesWithActiveCounts();

  return (
    <section className="space-y-6">
      <header>
        <h1 className="mb-3 text-4xl font-semibold text-foreground">Roblox Game Codes</h1>
        <p className="text-sm text-muted md:text-base">
          Track live Roblox rewards, redeem working codes, and discover fresh drops across the most-played games.
        </p>
      </header>

      <GameSearch games={games} />
    </section>
  );
}
