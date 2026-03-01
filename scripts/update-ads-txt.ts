/**
 * Fetches the latest provider-managed ads.txt file and writes it to the public directory.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ADS_TXT_URL =
  "https://adstxt.journeymv.com/sites/75d9ab7d-268c-4e03-bb6c-180ca4b8d5ed/ads.txt";
const ADS_TXT_URL = (process.env.ADS_TXT_URL ?? DEFAULT_ADS_TXT_URL).trim();
const OUTPUT_DIR = path.resolve(process.cwd(), "public");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "ads.txt");

async function main() {
  if (!ADS_TXT_URL) {
    console.warn("ADS_TXT_URL not specified; skipping ads.txt refresh.");
    return;
  }

  const response = await fetch(ADS_TXT_URL, { redirect: "follow" });

  if (!response.ok) {
    console.warn(
      `Skipping ads.txt refresh: ${ADS_TXT_URL} responded with ${response.status} ${response.statusText}`
    );
    return;
  }

  const content = (await response.text()).trim();

  if (!content) {
    console.warn("Skipping ads.txt refresh: received empty content from ads.txt source.");
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, `${content}\n`, "utf8");
  console.info(`ads.txt refreshed from ${ADS_TXT_URL}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
