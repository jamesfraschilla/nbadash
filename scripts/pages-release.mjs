import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function verifyRelease({ sha, baseUrl, fetchImpl = fetch, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), attempts = 6 }) {
  if (!/^[a-f0-9]{40}$/.test(sha || "")) throw new Error("A full commit SHA is required for release verification.");
  let reason = "No response";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const url = new URL("release.json", baseUrl);
      url.searchParams.set("verify", `${sha}-${attempt}-${Date.now()}`);
      const response = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const release = await response.json();
      if (release.sha === sha) return release;
      reason = `Expected ${sha}, received ${release.sha || "no release SHA"}`;
    } catch (error) {
      reason = error.message;
    }
    if (attempt < attempts) await wait(10000);
  }
  throw new Error(`Published release could not be verified: ${reason}`);
}

async function main() {
  const sha = process.env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(sha || "")) throw new Error("GITHUB_SHA must contain a full commit SHA.");
  if (process.argv[2] === "stamp") {
    await writeFile("dist/release.json", `${JSON.stringify({ sha })}\n`);
    console.log(`Stamped release ${sha}`);
  } else if (process.argv[2] === "verify") {
    await verifyRelease({ sha, baseUrl: "https://jamesfraschilla.github.io/nbadash/" });
    console.log(`Verified live release ${sha}`);
  } else throw new Error("Usage: node scripts/pages-release.mjs stamp|verify");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
