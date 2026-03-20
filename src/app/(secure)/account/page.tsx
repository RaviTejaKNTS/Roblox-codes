import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/app-session";
import { signOut } from "../login/actions";

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

const ACCOUNT_PATH = "/account";

type AccountPageProps = {
  searchParams?: Promise<{ error?: string | string[]; success?: string | string[] }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    redirect(`/login?next=${encodeURIComponent(ACCOUNT_PATH)}`);
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const errorMessage = Array.isArray(resolvedSearchParams?.error)
    ? resolvedSearchParams?.error[0]
    : resolvedSearchParams?.error ?? null;
  const successMessage = Array.isArray(resolvedSearchParams?.success)
    ? resolvedSearchParams?.success[0]
    : resolvedSearchParams?.success ?? null;

  const displayName = appUser.display_name ?? appUser.roblox_display_name ?? appUser.roblox_username ?? "Roblox user";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <section className="panel overflow-hidden">
        <div className="relative border-b border-border/60 px-6 pb-8 pt-10 sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_65%)]" />
          <div className="relative space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Account</p>
            <h1 className="text-2xl font-semibold text-foreground">Your Bloxodes profile</h1>
            <p className="text-sm text-muted">Signed in with Roblox.</p>
          </div>
        </div>

        <div className="space-y-6 px-6 py-8 sm:px-8">
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

          <div className="rounded-[var(--radius-lg)] border border-border/60 bg-surface px-4 py-4">
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Roblox account</p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              {appUser.roblox_avatar_url ? (
                <Image
                  src={appUser.roblox_avatar_url}
                  alt={displayName}
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-full border border-border/60"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border/60 bg-background/70 text-xs font-semibold text-muted">
                  RBX
                </div>
              )}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-foreground">{displayName}</p>
                  {appUser.role === "admin" ? (
                    <span className="rounded-full border border-amber-400/50 bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-amber-200">
                      Admin
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted">
                  {appUser.roblox_username ? `@${appUser.roblox_username}` : "Username unavailable"}
                </p>
                <p className="text-xs text-muted">
                  {appUser.roblox_user_id ? `Roblox ID: ${appUser.roblox_user_id}` : "Roblox id unavailable"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {appUser.roblox_profile_url ? (
              <Link
                href={appUser.roblox_profile_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-[var(--radius-lg)] border border-border/60 bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
              >
                Open Roblox profile
              </Link>
            ) : null}
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-[var(--radius-lg)] border border-border/60 bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
