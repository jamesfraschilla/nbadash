import test from "node:test";
import assert from "node:assert/strict";
import {applyGraphicPlayerOverride,normalizeGraphicPlayerOverride,normalizeGraphicPlayerOverrideMap,graphicPlayerOverrideKey} from "./graphicPlayerOverrides.js";
import {createPersonnelDraft,hydratePersonnelDraft,populatePersonnelDraftFromRoster,clearPersonnelStatOverridesForSeason} from "./personnelGraphic.js";
test("graphic jersey overrides preserve zero, double zero, blanks and roster fallback",()=>{
  const player={personId:"1",jerseyNum:"12"};
  for(const jerseyNum of ["0","00","77",""])assert.equal(applyGraphicPlayerOverride(player,{jerseyNum}).jerseyNum,jerseyNum);
  assert.equal(applyGraphicPlayerOverride(player,{jerseyNum:null}).jerseyNum,"12");
  assert.equal(normalizeGraphicPlayerOverride({jerseyNum:0}).jerseyNum,"0");
  assert.equal(normalizeGraphicPlayerOverride({jerseyNum:"abc"}).jerseyNum,null);
  assert.equal(normalizeGraphicPlayerOverride({jerseyNum:"#00"}).jerseyNum,"00");
  assert.equal(player.jerseyNum,"12");
});
test("overrides are scoped by player, team and league, not the lineup slot",()=>{
  const a=graphicPlayerOverrideKey("gleague","team-a","1");
  const map=normalizeGraphicPlayerOverrideMap({[a]:{jerseyNum:"77",headshotUrl:"https://example.com/photo.png",hideHeadshot:true},bogus:{jerseyNum:"1"}});
  assert.equal(Object.keys(map).length,1);
  assert.equal(applyGraphicPlayerOverride({personId:"1",jerseyNum:"3"},map[a]).jerseyNum,"77");
  assert.equal(applyGraphicPlayerOverride({jerseyNum:"3"},map[graphicPlayerOverrideKey("nba","team-a","1")]).jerseyNum,"3");
  assert.equal(applyGraphicPlayerOverride({jerseyNum:"3"},map[graphicPlayerOverrideKey("gleague","team-b","1")]).jerseyNum,"3");
  assert.equal(applyGraphicPlayerOverride({},map[a]).headshotHidden,true);
  assert.equal(applyGraphicPlayerOverride({},map[a]).headshotUrl,"https://example.com/photo.png");
});
test("personnel overrides survive saved-draft hydration, season changes and roster refreshes",()=>{
  const override={jerseyNum:"00",headshotUrl:"https://example.com/photo.png",headshotStoragePath:"user/personnel/photo.png",hideHeadshot:false};
  const draft=createPersonnelDraft({teamId:"t",rows:[{personId:"1",jerseyNum:"3",graphicOverrides:override}]});
  const saved=hydratePersonnelDraft(JSON.parse(JSON.stringify(draft)));
  assert.deepEqual(saved.rows[0].graphicOverrides,override);
  assert.deepEqual(clearPersonnelStatOverridesForSeason(saved,"2025-26").rows[0].graphicOverrides,override);
  const refreshed=populatePersonnelDraftFromRoster(saved,[{personId:"1",fullName:"Test Player",teamId:"t",jerseyNum:"22"}]);
  assert.equal(applyGraphicPlayerOverride(refreshed.rows[0],refreshed.rows[0].graphicOverrides).jerseyNum,"00");
  assert.deepEqual(refreshed.rows[0].graphicOverrides,override);
});
