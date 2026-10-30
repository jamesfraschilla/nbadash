import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("NBA historical PDF columns are mapped by header, not shifted by added fields", () => {
  const result = execFileSync("python3", ["-c", `
import importlib.util, json
s = importlib.util.spec_from_file_location('challenge_pdf', 'scripts/extract-nba-challenge-pdf.py')
m = importlib.util.module_from_spec(s)
s.loader.exec_module(m)
old = ['Date','Away Team','Home Team','Trigger','Initial Call','Final Ruling','Ruling Description','Team Challenged','Challenge Outcome','Period','Game Clock - Review is Triggered','Video Link']
new = old[:8] + ['# Challenge', 'Challenge Outcome', 'Timeout'] + old[9:]
try:
 m.column_indexes(['Unexpected', 'New schema'])
 rejected = False
except ValueError:
 rejected = True
print(json.dumps({'old':m.column_indexes(old),'new':m.column_indexes(new),'rejected':rejected}))
`], { encoding: "utf8" });
  const parsed = JSON.parse(result);
  assert.equal(parsed.old.challenge_outcome, 8);
  assert.equal(parsed.new.challenge_outcome, 9);
  assert.equal(parsed.new.period, 11);
  assert.equal(parsed.new.game_clock, 12);
  assert.equal(parsed.new.video_url, 13);
  assert.equal(parsed.rejected, true);
});
