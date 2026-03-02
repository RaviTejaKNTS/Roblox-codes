import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentAppUser } from "@/lib/auth/app-session";
import { sanitizeNextPath } from "@/lib/auth/navigation";
import { signOut } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false
    }
  }
};

type AuthPageProps = {
  searchParams?: Promise<{ error?: string | string[]; success?: string | string[]; next?: string | string[] }>;
};

export default async function AuthPage({ searchParams }: AuthPageProps) {
  const appUser = await getCurrentAppUser();

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const errorMessage = Array.isArray(resolvedSearchParams?.error) ? resolvedSearchParams?.error[0] : resolvedSearchParams?.error ?? null;
  const successMessage = Array.isArray(resolvedSearchParams?.success) ? resolvedSearchParams?.success[0] : resolvedSearchParams?.success ?? null;
  const nextParam = Array.isArray(resolvedSearchParams?.next) ? resolvedSearchParams?.next[0] : resolvedSearchParams?.next ?? "";
  const nextPath = sanitizeNextPath(nextParam || null);
  const robloxLoginHref = nextPath ? `/auth/roblox/login?next=${encodeURIComponent(nextPath)}` : "/auth/roblox/login";

  const signedInName =
    appUser?.display_name ??
    appUser?.roblox_display_name ??
    appUser?.roblox_username ??
    (appUser ? `Roblox User ${appUser.roblox_user_id ?? ""}`.trim() : null);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <section className="panel space-y-6 p-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Roblox login</p>
          <h1 className="text-2xl font-semibold text-foreground">Sign in with Roblox</h1>
          <p className="text-sm text-muted">Use your Roblox account to access your saved progress and account data.</p>
        </header>

        <div className="space-y-4">
          <Link
            href={robloxLoginHref}
            className="inline-flex w-full items-center justify-center rounded-[var(--radius-lg)] border border-border/60 bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
          >
            Continue with Roblox
          </Link>
        </div>

        <p className="text-xs text-muted">
          By continuing, you agree to our{" "}
          <Link href="/privacy-policy" className="text-foreground transition hover:text-accent">
            Privacy Policy
          </Link>
          .
        </p>

        {errorMessage ? (
          <div className="rounded-[var(--radius-lg)] border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}
        {successMessage ? (
          <div className="rounded-[var(--radius-lg)] border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {successMessage}
          </div>
        ) : null}
      </section>

      {appUser ? (
        <section className="panel mt-6 flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="space-y-1">
            <p className="text-sm text-muted">Signed in as</p>
            <p className="text-lg font-semibold text-foreground">{signedInName ?? "Roblox user"}</p>
            {appUser.roblox_username ? <p className="text-xs text-muted">@{appUser.roblox_username}</p> : null}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/account"
              className="inline-flex items-center justify-center rounded-[var(--radius-lg)] border border-border/60 bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
            >
              Account
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-[var(--radius-lg)] border border-border/60 bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
              >
                Sign out
              </button>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}
