import * as cheerio from "cheerio";

export type ScrapedCode = {
  code: string;
  status: "active" | "expired" | "check";
  rewardsText?: string;
  levelRequirement?: number | null;
  isNew?: boolean;
};

function extractCode($item: cheerio.Cheerio<cheerio.Element>, $: cheerio.CheerioAPI): string | null {
  // Primary: contenteditable container
  const primary = $item.find(".codes-list__copy-container [contenteditable]").first().text().trim();
  if (primary) return primary;

  // Fallback 1: data-search-terms (JSON array)
  const dataTerms = $item.attr("data-search-terms");
  if (dataTerms) {
    try {
      const arr = JSON.parse(dataTerms);
      if (Array.isArray(arr) && arr[0]) return String(arr[0]).trim();
    } catch {}
  }

  // Fallback 2: button[data-copy]
  const btn = $item.find("button.copy-button").attr("data-copy");
  if (btn) return String(btn).trim();

  // Fallback 3: any [data-code], [data-clipboard-text]
  const any =
    $item.find("[data-code],[data-clipboard-text]").attr("data-code") ||
    $item.find("[data-clipboard-text]").attr("data-clipboard-text");
  if (any) return String(any).trim();

  return null;
}

function extractStatus(
  $item: cheerio.Cheerio<cheerio.Element>,
  $: cheerio.CheerioAPI,
): "active" | "expired" | "check" {
  // Explicit expired markers
  if ($item.find('[data-expired="true"]').length > 0) return "expired";
  if ($item.find(".badge--inactive, .badge--expired").length > 0) return "expired";

  // Robloxden uses a "Check" badge for codes that may be inactive
  if ($item.find(".badge--check").length > 0) return "check";

  // If there is an "active" badge or class
  if ($item.find(".badge--active").length > 0) return "active";

  // Default assume active; if we cannot confirm, mark "check"
  const txt = $item.text().toLowerCase();
  if (/\b(expired|inactive)\b/.test(txt)) return "expired";
  if (/\b(check)\b/.test(txt)) return "check";

  return "active";
}

function sanitizeRewardText(text: string): string {
  let t = text.replace(/\s+/g, " ").trim();
  t = t.replace(/^Copy\s*/i, "");
  t = t.replace(/\s*(Active|Expired|Check)\s*$/i, "");
  t = t.replace(/this code credits your account with/i, "This code gives you");
  return t.trim();
}

function extractRewards($item: cheerio.Cheerio<cheerio.Element>, $: cheerio.CheerioAPI): string | undefined {
  // Try common containers
  const candidates = [
    ".codes-list__description",
    ".codes-list__rewards",
    ".codes-list__reward",
    ".codes-list__desc",
    ".codes-list__text",
  ];
  for (const sel of candidates) {
    const node = $item.find(sel).first();
    const raw = node.text();
    const cleaned = sanitizeRewardText(raw);
    if (cleaned) return cleaned;
  }
  // Fallback: entire item text minus code and button labels
  let text = $item.text();
  const code = extractCode($item, $);
  if (code) text = text.replace(code, "");
  const cleaned = sanitizeRewardText(text);
  return cleaned || undefined;
}

function parseLevelValue(raw?: string | null): number | null {
  if (!raw) return null;
  const match = raw.match(/(\d{1,4})/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function extractLevel(
  $item: cheerio.Cheerio<cheerio.Element>,
  $: cheerio.CheerioAPI,
  rewardsText?: string,
): number | null {
  const attrCandidates = [
    "data-level",
    "data-level-required",
    "data-level_requirement",
    "data-required-level",
    "data-levelreq",
  ];
  for (const attr of attrCandidates) {
    const direct = parseLevelValue($item.attr(attr) ?? undefined);
    if (direct != null) return direct;
    const nestedAttr = $item.find(`[${attr}]`).first().attr(attr);
    const nestedParsed = parseLevelValue(nestedAttr ?? undefined);
    if (nestedParsed != null) return nestedParsed;
  }

  const selectors = [
    ".codes-list__level",
    ".codes-list__meta",
    ".codes-list__requirement",
    ".codes-list__details",
    ".codes-list__info",
    ".codes-list__footer",
    ".badge--level",
    ".badge--req",
  ];
  for (const sel of selectors) {
    const text = $item.find(sel).first().text();
    if (text && /(?:level|lvl)/i.test(text)) {
      const parsed = parseLevelValue(text);
      if (parsed != null) return parsed;
    }
  }

  const anyLevel = $item
    .find('*')
    .filter((_, el) => {
      const text = $(el).text();
      return /(?:level|lvl)/i.test(text) && /\d/.test(text);
    })
    .first()
    .text();
  const parsedAny = parseLevelValue(anyLevel || undefined);
  if (parsedAny != null) return parsedAny;

  if (rewardsText) {
    const rewardMatch = rewardsText.match(/(?:level|lvl)\s*[:\-]?\s*(\d{1,4})/i);
    if (rewardMatch) return Number(rewardMatch[1]);
  }

  const fallback = $item.text().match(/(?:level|lvl)\s*[:\-]?\s*(\d{1,4})/i);
  return fallback ? Number(fallback[1]) : null;
}

function extractIsNew($item: cheerio.Cheerio<cheerio.Element>, $: cheerio.CheerioAPI): boolean {
  return $item.find(".badge--new, .badge--fresh, .badge--just-in, .codes-list__new-badge").length > 0;
}

export async function scrapeRobloxdenPage(url: string): Promise<ScrapedCode[]> {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; RobloxCodesBot/1.0)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Typical item selector
  const items = $("#masonry .codes-list__item, .codes-list__item");
  const out: ScrapedCode[] = [];

  items.each((_, el) => {
    const $item = $(el);
    const code = extractCode($item, $);
    if (!code) return;

    const status = extractStatus($item, $);
    const rewards = extractRewards($item, $);
    const level = extractLevel($item, $, rewards);
    const isNew = extractIsNew($item, $);

    out.push({ code, status, rewardsText: rewards, levelRequirement: level, isNew });
  });

  // Backup expired list (optional): look for a dropdown of "problem/expired codes"
  // We only add those not already in list
  const seen = new Set(out.map((o) => o.code));
  $("select option").each((_, opt) => {
    const val = $(opt).attr("value") || $(opt).text();
    const code = (val || "").toString().trim();
    if (!code) return;
    const lc = code.toLowerCase();
    if (seen.has(code)) return;
    if (lc.startsWith("select")) return;
    // Assume dropdown contains problem/expired codes
    out.push({
      code,
      status: "expired",
      rewardsText: "From dropdown",
      levelRequirement: null,
      isNew: false,
    });
    seen.add(code);
  });

  return out;
}
