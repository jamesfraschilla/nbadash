import { fetchScoreboard } from "../supabase/functions/_shared/scoreboard.js";
import { createClient } from "@supabase/supabase-js";
import { buildCompletedPeriodSnapshots, PERIOD_SNAPSHOT_CAPTURE_VERSION } from "../src/periodSnapshotTotals.js";
import { fetchRecoverableGame } from "../supabase/functions/_shared/nbaLiveRecovery.ts";

// Reconcile complete periods, including final games and delayed runs. Never
// label a live box score as a historical quarter-end snapshot.
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase credentials are required.");
const supabase = createClient(url, key, { auth: { persistSession: false } });
const ids = new Set();
const targets=String(process.env.CAPTURE_GAME_IDS || "").split(",").filter(Boolean);
if(targets.some(id=>!/^\d{10}$/.test(id)) || targets.length>50)throw Error("Invalid targeted snapshot game IDs");
for(const id of targets)ids.add(id);
const lookbackDays = Math.max(1, Math.min(14, Number(process.env.CAPTURE_LOOKBACK_DAYS || 3)));
for (let offset = 0; !targets.length && offset < lookbackDays; offset++) {
  const date = new Date(Date.now() - offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  for (const game of await fetchScoreboard(date, process.env.NBA_API_KEY)) {
    if ([2, 3].includes(game.gameStatus)) ids.add(game.gameId);
  }
}
let written = 0;
let verified = 0;
const errors = [];
const verifiedDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
for (const gameId of ids) {
  try {
  const { data: existing, error: readError } = await supabase.from("period_snapshots").select("period,team_id,totals").eq("game_id", gameId);
  if (readError) throw readError;
  // Finished games are reconciled at most once per Eastern day. In-progress
  // snapshots are always reconsidered so a final game gets its own checkpoint.
  if (existing?.length && existing.every((row) => row.totals?._captureVersion === PERIOD_SNAPSHOT_CAPTURE_VERSION && row.totals?._gameStatus === 3 && row.totals?._verifiedDate === verifiedDate)) {
    verified += existing.length;
    continue;
  }
  const game = await fetchRecoverableGame(String(gameId));
  const snapshots = buildCompletedPeriodSnapshots(game).map((row) => ({ ...row, totals: { ...row.totals, _gameStatus: game.gameStatus, _verifiedDate: verifiedDate } }));
  if (game.gameStatus === 3 && snapshots.length !== Number(game.period) * 2) throw new Error("Final game " + gameId + " is missing verified period endings.");
  const changed = snapshots.filter((row) => {
    const old = existing?.find((item) => item.period === row.period && item.team_id === row.team_id);
    return !old || Object.keys(row.totals).some((field) => row.totals[field] !== old.totals?.[field]) || Object.keys(old.totals || {}).length !== Object.keys(row.totals).length;
  });
  if (changed.length) {
    const { error } = await supabase.from("period_snapshots").upsert(changed, { onConflict: "game_id,period,team_id" });
    if (error) throw error;
    written += changed.length;
  }
  verified += snapshots.length;
  } catch (error) {
    errors.push({ gameId, message: error.message });
  }
}
console.log(JSON.stringify({ checkedGames: ids.size, verifiedSnapshots: verified, updatedSnapshots: written, errors }));
if (errors.length) process.exitCode = 1;
