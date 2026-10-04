import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const supabaseDir = path.join(root, "supabase");
const manifestPath = path.join(supabaseDir, "deployment-manifest.json");
const sqlOrder = [
  "accounts_auth.sql",
  "account_data_atomic.sql",
  "tool_record_save_lock_guard.sql",
  "rotations_shared_state.sql",
  "roster_feed_snapshots.sql",
  "game_analysis_segments.sql",
  "game_live_state.sql",
  "game_live_state_atomic.sql",
  "graphic_headshots_storage.sql",
  "player_headshots_storage.sql",
  "visual_drill_images_storage.sql",
  "officiating_intelligence.sql",
  "officiating_intelligence_hardening.sql",
  "officiating_reliability_hardening.sql",
  "officiating_season_scoped_rollup_caches.sql",
  "officiating_insights.sql",
  "officiating_insight_feedback.sql",
  "officiating_cache_rls.sql",
  "fix_officiating_stat_accuracy.sql",
  "remove_pgr_insights.sql",
  "challenge_context_tag_save_rpc.sql",
  "database_storage_audit.sql",
  "wizards_analysis_prewarm_schedule.sql",
];

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const functionNames = fs.readdirSync(path.join(supabaseDir, "functions"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(supabaseDir, "functions", entry.name, "index.ts")))
  .map((entry) => entry.name)
  .sort();
const actualSql = fs.readdirSync(supabaseDir).filter((name) => name.endsWith(".sql")).sort();

if (JSON.stringify([...sqlOrder].sort()) !== JSON.stringify(actualSql)) {
  throw new Error("SQL deployment order is incomplete. Update scripts/supabase-deployment-manifest.mjs for every SQL file.");
}

const next = {
  version: 1,
  databaseScripts: sqlOrder.map((name, index) => ({
    order: index + 1,
    path: `supabase/${name}`,
    sha256: sha256(path.join(supabaseDir, name)),
  })),
  edgeFunctions: functionNames.map((name) => ({
    name,
    entrypoint: `supabase/functions/${name}/index.ts`,
    sha256: sha256(path.join(supabaseDir, "functions", name, "index.ts")),
  })),
};

if (process.argv.includes("--write")) {
  fs.writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
  process.stdout.write(`Updated ${path.relative(root, manifestPath)}\n`);
} else {
  const current = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    throw new Error("Supabase deployment manifest is stale. Run npm run supabase:manifest:update and commit the result.");
  }
  process.stdout.write(`Supabase deployment manifest covers ${actualSql.length} SQL scripts and ${functionNames.length} Edge Functions.\n`);
}
