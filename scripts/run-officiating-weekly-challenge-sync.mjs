#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  discoverChallengeReviewDocuments,
  discoverSeasonPageUrl,
  shouldRunWeeklyChallengeSync,
} from "../src/officiatingChallengeDiscovery.js";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";

const CURRENT_SEASON = "2026-27";
const START_DATE = "2026-10-04";
const OFFICIAL_ORIGIN = "https://official.nba.com";
const EXPECTED_PAGE_URL = `${OFFICIAL_ORIGIN}/${CURRENT_SEASON}-nba-coachs-challenge-reviews/`;
const ARCHIVE_URL = `${OFFICIAL_ORIGIN}/archive/`;
const SOURCE = "nba_official_challenge_pdf";
const REQUEST_HEADERS = {
  Accept: "text/html,application/pdf,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Challenge Reconciliation)",
};

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = await readFile(filePath, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) return;
    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key]) return;
    process.env[key] = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  });
}

async function fetchResponse(url, acceptMissing = false) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { headers: REQUEST_HEADERS, signal: controller.signal });
    if (acceptMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`${url} failed (${response.status})`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverSeasonPage() {
  const expected = await fetchResponse(EXPECTED_PAGE_URL, true);
  if (expected) return { pageUrl: EXPECTED_PAGE_URL, html: await expected.text() };

  const archive = await fetchResponse(ARCHIVE_URL);
  const archiveHtml = await archive.text();
  const pageUrl = discoverSeasonPageUrl(archiveHtml, CURRENT_SEASON, ARCHIVE_URL);
  if (!pageUrl) return null;
  const page = await fetchResponse(pageUrl);
  return { pageUrl, html: await page.text() };
}

async function alreadyImported(supabase, sha256) {
  const { data, error } = await supabase
    .from("nba_coach_challenge_events")
    .select("id")
    .eq("season", CURRENT_SEASON)
    .eq("source", SOURCE)
    .contains("source_payload", { pdfSha256: sha256 })
    .limit(1);
  if (error) throw new Error(`Failed checking imported challenge documents: ${error.message}`);
  return Boolean(data?.length);
}

function runImporter({ document, filePath, pageUrl, sha256 }) {
  const args = [
    "scripts/import-nba-challenge-log.mjs",
    `--season=${CURRENT_SEASON}`,
    `--source=${document.kind}`,
    `--pdf=${filePath}`,
    `--pdf-url=${document.url}`,
    `--pdf-sha256=${sha256}`,
    `--official-page-url=${pageUrl}`,
    document.kind === "playoffs"
      ? "--season-types=Playoffs"
      : "--season-types=Preseason,Regular Season",
    document.kind === "playoffs"
      ? "--game-id-prefixes=004"
      : "--game-id-prefixes=001,002",
    "--enrichment-concurrency=3",
    "--apply",
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env: process.env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Challenge importer exited with code ${code}`));
    });
  });
}

async function main() {
  await loadEnvFile(path.join(process.cwd(), ".env"));
  await loadEnvFile(path.join(process.cwd(), ".env.local"));
  if (!hasFlag("force") && !shouldRunWeeklyChallengeSync({ startDate: START_DATE })) {
    console.log(`Skipping: weekly challenge sync begins ${START_DATE} and runs Sundays at 5 AM Eastern.`);
    return;
  }
  await assertOutsideWizardsGameWindow("weekly NBA challenge reconciliation");

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

  const seasonPage = await discoverSeasonPage();
  if (!seasonPage) {
    console.log(`The NBA has not published the ${CURRENT_SEASON} challenge-review page yet.`);
    return;
  }
  const documents = discoverChallengeReviewDocuments(seasonPage.html, seasonPage.pageUrl);
  if (!documents.length) {
    console.log(`No reviews-by-day PDFs are published on ${seasonPage.pageUrl} yet.`);
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const workDir = await mkdtemp(path.join(tmpdir(), "nba-challenge-sync-"));
  let imported = 0;
  try {
    for (const document of documents) {
      const response = await fetchResponse(document.url);
      const bytes = Buffer.from(await response.arrayBuffer());
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (await alreadyImported(supabase, sha256)) {
        console.log(`Unchanged ${document.kind} challenge PDF: ${document.url}`);
        continue;
      }
      const filePath = path.join(workDir, `${document.kind}-${sha256.slice(0, 12)}.pdf`);
      await writeFile(filePath, bytes);
      console.log(`Importing updated ${document.kind} challenge PDF: ${document.url}`);
      await runImporter({ document, filePath, pageUrl: seasonPage.pageUrl, sha256 });
      imported += 1;
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ season: CURRENT_SEASON, documentsFound: documents.length, imported }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
