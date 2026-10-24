import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { playerHeadshotOverrides } from "../src/playerHeadshotOverrides.js";
import { refreshNbaHeadshotUrl } from "../src/playerHeadshotPolicy.js";

// Explicit diagnostic only: download into bounded memory, record no image files.
const rosters = JSON.parse(await readFile(new URL("../src/data/rosters.json", import.meta.url), "utf8"));
const teams = Object.entries(rosters).filter(([id]) => /^161061\d{4}$/.test(id));
const players = [...new Map(teams.flatMap(([teamId, rows]) => rows.map((player) => [String(player.personId), { ...player, teamId }]))).values()];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function imageInfo(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok || !String(response.headers.get("content-type")).startsWith("image/")) return { ok: false, status: response.status };
  const bytes = await response.arrayBuffer();
  return { ok: true, bytes: bytes.byteLength, hash: hash(Buffer.from(bytes)) };
}
const fallback = await imageInfo("https://cdn.nba.com/headshots/nba/latest/1040x760/fallback.png");
if (!fallback.ok) throw new Error("Could not fetch fallback reference; image audit would be inconclusive.");
const results = [];
let index = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (index < players.length) {
    const player = players[index++];
    try {
      const info = await imageInfo(refreshNbaHeadshotUrl(`https://cdn.nba.com/headshots/nba/latest/1040x760/${player.personId}.png`));
      const missing = !info.ok || info.hash === fallback.hash;
      const override = playerHeadshotOverrides[player.personId];
      let overrideOk = null;
      if (override) overrideOk = (await imageInfo(Array.isArray(override) ? override[0] : override)).ok;
      results.push({ personId: player.personId, name: player.fullName, teamId: player.teamId, available: !missing, overrideOk, status: info.status });
    } catch (error) {
      results.push({ personId: player.personId, name: player.fullName, teamId: player.teamId, available: false, error: error.message });
    }
  }
}));
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(), teams: teams.length, players: results.length,
  nbaImagesAvailable: results.filter((row) => row.available).length,
  issues: results.filter((row) => !row.available || row.overrideOk === false),
  buzelis: results.find((row) => String(row.personId) === "1641824"),
}, null, 2));
