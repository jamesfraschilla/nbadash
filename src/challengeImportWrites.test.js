import test from "node:test";
import assert from "node:assert/strict";
import { prepareChallengeImportWrites } from "../scripts/lib/challenge-import-writes.mjs";
const base = { game_id:"0022600162",challenging_team:"WAS",period:4,game_clock:"03:59",source:"nba_official_challenge_pdf" };
test("mixed new/existing imports assign every ID and retain existing references", () => {
  const result = prepareChallengeImportWrites([base,{...base,period:3}], [{...base,id:"existing"}], ()=>"new");
  assert.deepEqual(result.writes.map(row=>row.id),["existing","new"]);
  assert.equal(result.inserted,1);
  assert.equal(result.updated,1);
});
test("weekly reimports preserve source-backed attribution and manual decisions", () => {
  const existing={...base,id:"existing",whistling_official_name:"Ashley Moyer-Gleich",challenge_sub_type:"Foul on Floor",
    review_status:"auto",source_payload:{pdfSha256:"old",gamebookChallenge:{url:"book"}}};
  const incoming={...base,whistling_official_name:"",challenge_sub_type:"",source_payload:{pdfSha256:"new",pdfRow:{initial_call:"Defensive Foul"}}};
  const [write]=prepareChallengeImportWrites([incoming],[existing]).writes;
  assert.equal(write.whistling_official_name,"Ashley Moyer-Gleich");
  assert.equal(write.challenge_sub_type,"Foul on Floor");
  assert.equal(write.source_payload.gamebookChallenge.url,"book");
  assert.equal(write.source_payload.pdfSha256,"new");
  assert.equal(write.review_status,"needs_review");
  assert.equal(prepareChallengeImportWrites([incoming],[{...existing,review_status:"manual"}]).writes[0].review_status,"manual");
});
test("empty or duplicate generated IDs fail before any writes",()=>{
  assert.throws(()=>prepareChallengeImportWrites([base],[],()=>null),/empty ID/);
  assert.throws(()=>prepareChallengeImportWrites([base,{...base,period:3}],[],()=>"duplicate"),/Duplicate/);
});
test("new official PDF records inherit unambiguous gamebook evidence from the PBP sibling",()=>{
  const sibling={...base,source:"play_by_play",game_clock:"PT03M59.00S",id:"pbp-id",whistling_official_name:"Ashley Moyer-Gleich",
    source_payload:{gamebookChallenge:{url:"book"}},review_status:"auto"};
  const {writes,inserted}=prepareChallengeImportWrites([base],[sibling],()=>"pdf-id");
  assert.equal(inserted,1);
  assert.equal(writes[0].id,"pdf-id");
  assert.equal(writes[0].whistling_official_name,"Ashley Moyer-Gleich");
  assert.equal(writes[0].source,"nba_official_challenge_pdf");
});
