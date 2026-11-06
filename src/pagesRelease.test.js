import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifyRelease } from "../scripts/pages-release.mjs";

const sha = "a".repeat(40);
const baseUrl = "https://example.com/nbadash/";

test("release verification retries stale CDN responses and validates the exact commit", async () => {
  let calls = 0;
  let waits = 0;
  const release = await verifyRelease({ sha, baseUrl,
    fetchImpl: async (url, options) => {
      assert.equal(url.pathname, "/nbadash/release.json");
      assert.equal(options.cache, "no-store");
      assert.ok(url.searchParams.has("verify"));
      calls += 1;
      return { ok: true, json: async () => ({ sha: calls === 1 ? "b".repeat(40) : sha }) };
    }, wait: async () => { waits += 1; },
  });
  assert.equal(release.sha, sha);
  assert.equal(calls, 2);
  assert.equal(waits, 1);
});

test("release verification fails after bounded HTTP failures", async () => {
  let calls = 0;
  await assert.rejects(verifyRelease({ sha, baseUrl, attempts: 2,
    fetchImpl: async () => { calls += 1; return { ok: false, status: 503 }; }, wait: async () => {},
  }), /HTTP 503/);
  assert.equal(calls, 2);
});

test("release verification never treats a different commit as success", async () => {
  await assert.rejects(verifyRelease({ sha, baseUrl, attempts: 1,
    fetchImpl: async () => ({ ok: true, json: async () => ({ sha: "b".repeat(40) }) }),
  }), /Expected/);
  await assert.rejects(verifyRelease({ sha: "", baseUrl }), /full commit SHA/);
});

test("Pages workflow retains verification and one bounded same-artifact retry", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
  assert.match(workflow, /cancel-in-progress: false/);
  assert.equal((workflow.match(/runs-on: ubuntu-24\.04/g) || []).length, 2);
  assert.match(workflow, /name: Install browser\s+timeout-minutes: 5/);
  assert.equal((workflow.match(/uses: actions\/deploy-pages@v5/g) || []).length, 2);
  assert.match(workflow, /steps\.deployment\.outcome == 'failure'/);
  assert.match(workflow, /node scripts\/pages-release\.mjs stamp/);
  assert.match(workflow, /node scripts\/pages-release\.mjs verify/);
});
