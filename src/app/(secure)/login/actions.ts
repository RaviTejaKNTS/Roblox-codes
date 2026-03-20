"use server";

import { redirect } from "next/navigation";
import { revokeCurrentAppSession } from "@/lib/auth/app-session";

const AUTH_PATH = "/login";

function buildRedirect(status: "success" | "error", message: string, nextPath?: string) {
  const params = new URLSearchParams({ [status]: message });
  if (nextPath) {
    params.set("next", nextPath);
  }
  return `${AUTH_PATH}?${params.toString()}`;
}

export async function signOut() {
  await revokeCurrentAppSession();
  redirect(buildRedirect("success", "Signed out."));
}
