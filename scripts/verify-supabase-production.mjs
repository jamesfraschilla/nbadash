import crypto from "node:crypto";
import fs from "node:fs";

const manifestText = fs.readFileSync("supabase/deployment-manifest.json", "utf8");
const manifest = JSON.parse(manifestText);
const expected = crypto.createHash("sha256").update(manifestText).digest("hex");
const databaseSha256 = crypto.createHash("sha256").update(JSON.stringify(manifest.databaseScripts)).digest("hex");
const edgeSha256 = crypto.createHash("sha256").update(JSON.stringify({
  config: manifest.edgeConfigSha256,
  functions: manifest.edgeFunctions,
})).digest("hex");
const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
const recordDatabase = process.argv.includes("--record-database");
const recordEdge = process.argv.includes("--record-edge");
if (process.argv.includes("--record") || recordDatabase || recordEdge) {
  const currentResponse = await fetch(`${url}/rest/v1/supabase_deployment_state?id=eq.true&select=*`, { headers });
  if (!currentResponse.ok) throw new Error(`Unable to read deployment state (${currentResponse.status}).`);
  const [current] = await currentResponse.json();
  const payload = {
    id: true,
    manifest_sha256: expected,
    database_sha256: recordEdge && !recordDatabase ? current?.database_sha256 : databaseSha256,
    edge_sha256: recordDatabase && !recordEdge ? current?.edge_sha256 : edgeSha256,
    deployed_by: process.env.GITHUB_SHA || "local-cli",
  };
  const response = await fetch(`${url}/rest/v1/supabase_deployment_state?on_conflict=id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Unable to record deployment state (${response.status}): ${await response.text()}`);
  console.log(`Recorded Supabase manifest ${expected}.`);
} else {
  const response = await fetch(`${url}/rest/v1/supabase_deployment_state?id=eq.true&select=manifest_sha256,database_sha256,edge_sha256,deployed_at,deployed_by`, { headers });
  if (!response.ok) throw new Error(`Unable to read deployment state (${response.status}): ${await response.text()}`);
  const [state] = await response.json();
  const databaseOnly = process.argv.includes("--check-database");
  if (!state || (databaseOnly ? state.database_sha256 !== databaseSha256 : state.manifest_sha256 !== expected)) {
    throw new Error(`Supabase production drift detected. Expected ${expected}, found ${state?.manifest_sha256 || "no deployment record"}.`);
  }
  console.log(`Supabase production matches manifest ${expected} (deployed ${state.deployed_at}).`);
}
