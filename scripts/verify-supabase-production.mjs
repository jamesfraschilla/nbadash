import crypto from "node:crypto";
import fs from "node:fs";

const manifestText = fs.readFileSync("supabase/deployment-manifest.json", "utf8");
const expected = crypto.createHash("sha256").update(manifestText).digest("hex");
const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
if (process.argv.includes("--record")) {
  const response = await fetch(`${url}/rest/v1/supabase_deployment_state?on_conflict=id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: true, manifest_sha256: expected, deployed_by: process.env.GITHUB_SHA || "local-cli" }),
  });
  if (!response.ok) throw new Error(`Unable to record deployment state (${response.status}): ${await response.text()}`);
  console.log(`Recorded Supabase manifest ${expected}.`);
} else {
  const response = await fetch(`${url}/rest/v1/supabase_deployment_state?id=eq.true&select=manifest_sha256,deployed_at,deployed_by`, { headers });
  if (!response.ok) throw new Error(`Unable to read deployment state (${response.status}): ${await response.text()}`);
  const [state] = await response.json();
  if (!state || state.manifest_sha256 !== expected) {
    throw new Error(`Supabase production drift detected. Expected ${expected}, found ${state?.manifest_sha256 || "no deployment record"}.`);
  }
  console.log(`Supabase production matches manifest ${expected} (deployed ${state.deployed_at}).`);
}
