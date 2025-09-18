import { createHash } from "crypto";
import type { Author } from "./db";

export function gravatarUrl(email?: string | null, size = 160): string | null {
  if (!email) return null;
  const hash = createHash("md5").update(email.trim().toLowerCase()).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=mp`;
}

export function authorAvatarUrl(author: Author | null | undefined, size = 160): string {
  if (!author) return "https://www.gravatar.com/avatar/?d=mp";
  return author.avatar_url || gravatarUrl(author.gravatar_email, size) || "https://www.gravatar.com/avatar/?d=mp";
}
