'use client';

import { FormEvent, useEffect, useMemo, useState } from "react";
import "@/styles/article-content.css";
import { trackEvent } from "@/lib/analytics";
import { RobuxBundle } from "./robux-bundles";
import {
  BudgetPlan,
  DEFAULT_HAS_PREMIUM,
  DEFAULT_TARGET_ROBUX,
  DEFAULT_TARGET_USD,
  PlanBreakdown,
  PlanWithPlatform,
  PlatformOption,
  buildBudgetPlan,
  buildRobuxPlan,
  buildValueBundlePlan,
  robuxForBundle,
  selectBestRobuxPlan
} from "./robux-plans";

type CalculatorMode = "robux_to_usd" | "usd_to_robux";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2
});
const usdPerRobux = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4
});

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function formatBaseRobux(bundle: RobuxBundle): string {
  const mobile = bundle.baseMobile != null ? `${formatNumber(bundle.baseMobile)} Robux (mobile)` : null;
  const pcWeb = bundle.basePcWeb != null ? `${formatNumber(bundle.basePcWeb)} Robux (PC/Web)` : null;
  if (mobile && pcWeb) return `${mobile} / ${pcWeb}`;
  return mobile ?? pcWeb ?? "—";
}

function formatPremiumBonus(bundle: RobuxBundle): string {
  const mobile = bundle.bonusMobile != null ? `${formatNumber(bundle.bonusMobile)} Robux (mobile)` : null;
  const pcWeb = bundle.bonusPcWeb != null ? `${formatNumber(bundle.bonusPcWeb)} Robux (PC/Web)` : null;
  if (mobile && pcWeb) return `${mobile} / ${pcWeb}`;
  return mobile ?? pcWeb ?? "—";
}

function formatBundleLine(entry: PlanBreakdown, platform: PlatformOption, hasPremium: boolean): string {
  const baseRobux = robuxForBundle(entry.bundle, platform, false) ?? entry.robuxPerBundle;
  const premiumRobux = robuxForBundle(entry.bundle, platform, true) ?? baseRobux;
  const premiumNote =
    premiumRobux !== baseRobux ? ` (${formatNumber(premiumRobux)} Robux for Premium users)` : "";
  return `${entry.count} × ${formatNumber(baseRobux)} Robux${premiumNote} — ${currency.format(entry.pricePerBundle)}`;
}

function platformLabel(platform: PlatformOption | null): string {
  if (platform === "pc_web") return "PC / Web / Gift Cards";
  if (platform === "mobile") return "Mobile / Microsoft Store";
  return "—";
}

type RobuxPurchaseClientProps = {
  bundles: RobuxBundle[];
  initialRobuxTarget?: number;
  initialUsdTarget?: number;
  initialHasPremium?: boolean;
  initialRobuxPlan?: PlanWithPlatform | null;
  initialValuePlan?: PlanWithPlatform | null;
  initialBudgetPlan?: BudgetPlan | null;
};

export function RobuxPurchaseClient({
  bundles,
  initialRobuxTarget = DEFAULT_TARGET_ROBUX,
  initialUsdTarget = DEFAULT_TARGET_USD,
  initialHasPremium = DEFAULT_HAS_PREMIUM,
  initialRobuxPlan = null,
  initialValuePlan = null,
  initialBudgetPlan = null
}: RobuxPurchaseClientProps) {
  const [mode, setMode] = useState<CalculatorMode>("robux_to_usd");
  const [targetRobuxInput, setTargetRobuxInput] = useState(() => initialRobuxTarget.toString());
  const [targetUsdInput, setTargetUsdInput] = useState(() => initialUsdTarget.toString());
  const [hasPremium, setHasPremium] = useState(initialHasPremium);
  const [robuxPlan, setRobuxPlan] = useState<PlanWithPlatform | null>(initialRobuxPlan ?? null);
  const [valueBundlePlan, setValueBundlePlan] = useState<PlanWithPlatform | null>(initialValuePlan ?? null);
  const [budgetPlan, setBudgetPlan] = useState<BudgetPlan | null>(initialBudgetPlan ?? null);

  const activeBundles = useMemo(
    () =>
      bundles
        .filter((bundle) => bundle.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [bundles]
  );

  const parsedRobux = Number(targetRobuxInput);
  const parsedUsd = Number(targetUsdInput);

  useEffect(() => {
    if (Number.isFinite(parsedRobux) && parsedRobux > 0) {
      const pcPlan = buildRobuxPlan(parsedRobux, "pc_web", hasPremium, bundles);
      const mobilePlan = buildRobuxPlan(parsedRobux, "mobile", hasPremium, bundles);
      setRobuxPlan(selectBestRobuxPlan(pcPlan, mobilePlan));
      setValueBundlePlan(buildValueBundlePlan(parsedRobux, hasPremium, bundles));
    } else {
      setRobuxPlan(null);
      setValueBundlePlan(null);
    }
  }, [parsedRobux, hasPremium, bundles]);

  useEffect(() => {
    if (Number.isFinite(parsedUsd) && parsedUsd > 0) {
      setBudgetPlan(buildBudgetPlan(parsedUsd, hasPremium, bundles));
    } else {
      setBudgetPlan(null);
    }
  }, [parsedUsd, hasPremium, bundles]);

  const displayRobuxPlan = robuxPlan;
  const displayValuePlan = valueBundlePlan;
  const displayBudgetPlan = budgetPlan;
  const formattedTargetRobux = Number.isFinite(parsedRobux) ? formatNumber(parsedRobux) : "—";

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <div className="inline-flex overflow-hidden rounded-full border border-border/70 bg-surface text-sm font-semibold shadow-soft">
          <button
            type="button"
            onClick={() => setMode("robux_to_usd")}
            className={`px-4 py-2 transition ${mode === "robux_to_usd" ? "bg-accent text-white dark:bg-accent-dark" : "text-foreground"}`}
          >
            Robux → USD
          </button>
          <button
            type="button"
            onClick={() => setMode("usd_to_robux")}
            className={`px-4 py-2 transition ${mode === "usd_to_robux" ? "bg-accent text-white dark:bg-accent-dark" : "text-foreground"}`}
          >
            USD → Robux
          </button>
        </div>
      </section>

      {mode === "robux_to_usd" ? (
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
          <form
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              setTargetRobuxInput(targetRobuxInput.trim());
              trackEvent("calculator_input_commit", {
                tool_code: "robux-to-usd-calculator",
                target_robux: Number(targetRobuxInput)
              });
            }}
            className="panel space-y-5 p-6"
          >
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">Robux to USD</h2>
            </div>
            <label className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface px-4 py-3 shadow-soft">
              <span className="text-sm font-semibold text-foreground">How many Robux do you want?</span>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={targetRobuxInput}
                onChange={(e) => setTargetRobuxInput(e.target.value)}
                className="w-full rounded-md border border-border/60 bg-white/5 px-3 py-2 text-base text-foreground outline-none ring-2 ring-transparent transition focus:ring-accent/50 dark:bg-white/10"
                placeholder="Enter amount (e.g. 4600)"
              />
            </label>
            <div className="flex flex-wrap gap-3 rounded-lg border border-border/60 bg-surface px-4 py-4 shadow-soft">
              <span className="text-sm font-semibold text-foreground w-full">Do you have Roblox Premium?</span>
              <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${hasPremium ? "border-accent bg-accent/10 text-foreground" : "border-border/60"}`}>
                <input type="radio" name="premium" value="yes" checked={hasPremium} onChange={() => setHasPremium(true)} className="accent-accent" />
                <span>Yes</span>
              </label>
              <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${!hasPremium ? "border-accent bg-accent/10 text-foreground" : "border-border/60"}`}>
                <input type="radio" name="premium" value="no" checked={!hasPremium} onChange={() => setHasPremium(false)} className="accent-accent" />
                <span>No</span>
              </label>
            </div>
          </form>

          <div className="panel flex h-full flex-col gap-6 p-6">
            <div className="space-y-2" />

            <div className="rounded-lg border border-border/60 bg-surface px-4 py-4 space-y-2">
              <p className="text-sm text-muted">Approx cost for exactly {formattedTargetRobux} Robux</p>
              <p className="text-3xl font-semibold text-foreground">
                {displayRobuxPlan ? currency.format(displayRobuxPlan.approxCostForRequested) : "—"}
              </p>
              <p className="text-sm text-muted">This is just an approximate amount for the Robux you need.</p>
            </div>

            <p className="text-sm text-muted">Roblox only sells Robux in fixed bundles — here are the two best ways to cover your target.</p>

            <div className="grid items-stretch gap-4 md:grid-cols-2">
              <div className="flex h-full flex-col gap-4 rounded-lg border border-border/60 bg-surface px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold leading-tight text-foreground max-w-[70%]">Bundle to get just as much as needed</h3>
                  <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">Cheapest</span>
                </div>
                <div className="flex flex-wrap items-baseline gap-4">
                  <p className="text-3xl font-semibold text-foreground">
                    {displayRobuxPlan ? currency.format(displayRobuxPlan.totalPrice) : "—"}
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    Robux you will receive: <span className="text-2xl">{displayRobuxPlan ? formatNumber(displayRobuxPlan.totalRobux) : "—"}</span>
                  </p>
                </div>
                <div className="flex-1" />
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-muted">
                    <span>Bundle breakdown</span>
                    <span className="rounded-full border border-border/60 px-3 py-1 text-[11px] text-foreground">
                      {platformLabel(displayRobuxPlan?.platform ?? null)}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm text-foreground">
                    {displayRobuxPlan?.breakdown.map((entry) => (
                      <p key={entry.bundle.id}>{formatBundleLine(entry, displayRobuxPlan.platform, hasPremium)}</p>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex h-full flex-col gap-4 rounded-lg border border-border/60 bg-surface px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold leading-tight text-foreground max-w-[70%]">Best value for money bundle</h3>
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600">Best value</span>
                </div>
                <div className="flex flex-wrap items-baseline gap-4">
                  <p className="text-3xl font-semibold text-foreground">
                    {displayValuePlan ? currency.format(displayValuePlan.totalPrice) : "—"}
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    Robux you will receive: <span className="text-2xl">{displayValuePlan ? formatNumber(displayValuePlan.totalRobux) : "—"}</span>
                  </p>
                </div>
                <div className="flex-1" />
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-muted">
                    <span>Bundle breakdown</span>
                    <span className="rounded-full border border-border/60 px-3 py-1 text-[11px] text-foreground">
                      {platformLabel(displayValuePlan?.platform ?? null)}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm text-foreground">
                    {displayValuePlan?.breakdown.map((entry) => (
                      <p key={entry.bundle.id}>{formatBundleLine(entry, displayValuePlan.platform, hasPremium)}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
          <form
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              setTargetUsdInput(targetUsdInput.trim());
              trackEvent("calculator_input_commit", {
                tool_code: "robux-to-usd-calculator",
                target_usd: Number(targetUsdInput)
              });
            }}
            className="panel space-y-5 p-6"
          >
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">USD to Robux</h2>
            </div>
            <label className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface px-4 py-3 shadow-soft">
              <span className="text-sm font-semibold text-foreground">How much USD do you have?</span>
              <input
                type="number"
                min={0.01}
                step="0.01"
                inputMode="decimal"
                value={targetUsdInput}
                onChange={(e) => setTargetUsdInput(e.target.value)}
                className="w-full rounded-md border border-border/60 bg-white/5 px-3 py-2 text-base text-foreground outline-none ring-2 ring-transparent transition focus:ring-accent/50 dark:bg-white/10"
                placeholder="Enter budget (e.g. 9.99)"
              />
            </label>
            <div className="flex flex-wrap gap-3 rounded-lg border border-border/60 bg-surface px-4 py-4 shadow-soft">
              <span className="text-sm font-semibold text-foreground w-full">Do you have Roblox Premium?</span>
              <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${hasPremium ? "border-accent bg-accent/10 text-foreground" : "border-border/60"}`}>
                <input type="radio" name="premium" value="yes" checked={hasPremium} onChange={() => setHasPremium(true)} className="accent-accent" />
                <span>Yes</span>
              </label>
              <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${!hasPremium ? "border-accent bg-accent/10 text-foreground" : "border-border/60"}`}>
                <input type="radio" name="premium" value="no" checked={!hasPremium} onChange={() => setHasPremium(false)} className="accent-accent" />
                <span>No</span>
              </label>
            </div>
          </form>

          <div className="panel flex h-full flex-col gap-6 p-6">
            <div className="space-y-2" />
            <div className="rounded-lg border border-border/60 bg-surface px-4 py-4 space-y-2">
              <p className="text-sm text-muted">Approx Robux for exactly {Number.isFinite(parsedUsd) ? currency.format(parsedUsd) : "—"}</p>
              <p className="text-3xl font-semibold text-foreground">
                {displayBudgetPlan ? formatNumber(Math.round(displayBudgetPlan.approxRobuxForBudget)) : "—"}
              </p>
              <p className="text-sm text-muted">This is just an approximate amount of Robux you get for the price you entered.</p>
            </div>

            <div className="rounded-lg border border-border/60 bg-surface px-4 py-4 space-y-3">
              <p className="text-sm text-muted">Roblox only sells Robux in fixed bundles, so we pick the bundle that gives the best value per dollar.</p>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Bundle price (PC / Web / Gift Cards)</h3>
                <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">Recommended</span>
              </div>
              <p className="text-3xl font-semibold text-foreground">{displayBudgetPlan ? currency.format(displayBudgetPlan.totalPrice) : "—"}</p>
              <p className="text-lg font-semibold text-foreground">
                Robux you will receive: <span className="text-2xl">{displayBudgetPlan ? formatNumber(displayBudgetPlan.totalRobux) : "—"}</span>
              </p>
              <div className="space-y-1 text-sm text-foreground">
                {displayBudgetPlan?.breakdown.map((entry) => (
                  <p key={entry.bundle.id}>{formatBundleLine(entry, "pc_web", hasPremium)}</p>
                ))}
              </div>
            </div>
            </div>
        </section>
      )}

      <section className="panel space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Robux pricing table</h2>
            <p className="text-sm text-muted">
              These are current Roblox bundles available (listed only active ones). Even the calculator uses the same bundles to suggest.
            </p>
          </div>
        </div>

        <div className="table-scroll-wrapper">
          <div className="table-scroll-inner game-copy">
            <table>
              <thead>
                <tr>
                  <th className="table-col-compact">Price (USD)</th>
                  <th>Base Robux</th>
                  <th>Premium bonus</th>
                  <th>Platforms</th>
                  <th className="table-col-compact">1 Robux price (USD)</th>
                </tr>
              </thead>
              <tbody>
                {activeBundles.map((bundle) => {
                  const bestBase = Math.max(bundle.basePcWeb ?? 0, bundle.baseMobile ?? 0);
                  const pricePerRobux = bestBase > 0 ? usdPerRobux.format(bundle.priceUsd / bestBase) : "—";
                  const cleanNotes = bundle.notes === "Marked with * in Roblox store." ? null : bundle.notes;
                  const platformsDisplay = Array.from(
                    new Set([
                      ...bundle.platforms.map((platform) => platform.replace(/\*+$/, "")),
                      ...(bundle.platforms.includes("Roblox Website") ? ["Roblox PC/Mac App"] : [])
                    ])
                  );
                  return (
                    <tr key={bundle.id}>
                      <td className="font-semibold text-foreground">{currency.format(bundle.priceUsd)}</td>
                      <td className="text-muted">{formatBaseRobux(bundle)}</td>
                      <td className="text-muted">{formatPremiumBonus(bundle)}</td>
                      <td className="space-y-1">
                        <div className="flex flex-wrap gap-2 text-sm text-foreground">
                          {platformsDisplay.map((platform) => (
                            <span key={platform}>{platform}</span>
                          ))}
                        </div>
                        {cleanNotes ? <p className="text-[11px] text-muted">{cleanNotes}</p> : null}
                      </td>
                      <td className="text-muted">{pricePerRobux}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

    </div>
  );
}
