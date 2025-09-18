const CLEAN_PREFIXES = [/^this code gives you\s*/i, /^redeem for\s*/i, /^grants?\s*/i, /^gives?\s*/i];
const CONNECTOR_REGEX = /\s*(?:and|&|\+|\/|\band then\b)\s*/gi;

function titleCase(word: string) {
  return word
    .split(" ")
    .map((part) => {
      if (!part) return part;
      if (part === part.toUpperCase()) return part;
      return part[0].toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

export function extractRewardItems(text?: string | null): string[] {
  if (!text) return [];
  let cleaned = text.replace(/\s+/g, " ").trim();

  for (const prefix of CLEAN_PREFIXES) {
    cleaned = cleaned.replace(prefix, "");
  }

  cleaned = cleaned.replace(/[.;]/g, ",");
  cleaned = cleaned.replace(CONNECTOR_REGEX, ",");
  const parts = cleaned
    .split(",")
    .map((p) => p.replace(/^[+×x*]+\s*/, "").trim())
    .filter(Boolean);

  const unique = new Map<string, string>();
  for (const raw of parts) {
    let item = raw
      .replace(/^\d+(?:\.\d+)?\s*(?:x|times)?\s*/i, "")
      .replace(/^(?:a|an|the)\s+/i, "")
      .replace(/\s+codes?\b/gi, "")
      .replace(/\s+reward(s)?\b/gi, "")
      .replace(/\bfree\b/gi, "")
      .trim()
      .replace(/\s+/g, " ");
    if (!item) continue;

    item = titleCase(item);
    const key = item.toLowerCase();
    if (!unique.has(key)) unique.set(key, item);
  }
  return Array.from(unique.values());
}
