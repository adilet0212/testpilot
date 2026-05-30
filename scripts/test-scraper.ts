// scripts/test-scraper.ts

import { config } from "dotenv";
config({ path: ".env.local" }); // load env vars before anything else

import { scrapePage } from "../lib/playwright/scraper";

async function main() {
  console.log("Starting scrape of localhost...");
  const snapshot = await scrapePage("http://localhost:3000");
  console.log(JSON.stringify(snapshot, null, 2));
  console.log("Done.");
}

main().catch(console.error);