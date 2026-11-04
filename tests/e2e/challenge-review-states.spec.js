import {test,expect} from "@playwright/test";
test("confirmed whistle omissions are separate from source conflicts and missing book matches",async({page})=>{
  const base={season:"2026-27",season_type:"Regular Season",game_id:"0022600015",game_date:"2026-10-30",
    away_team:"CHA",home_team:"WAS",challenging_team:"WAS",period:3,challenge_type:"Foul",
    challenge_outcome:"successful",review_status:"needs_review",source:"nba_official_challenge_pdf"};
  const rows=[
    {...base,id:"omission",game_clock:"01:00",match_reason:"gamebook-whistle-not-published"},
    {...base,id:"replacement",game_clock:"02:00",match_reason:"gamebook-vs-official-initial-call-conflict",gamebook_conflict_kind:"replacement-event-label"},
    {...base,id:"conflict",game_clock:"03:00",match_reason:"gamebook-vs-official-initial-call-conflict",gamebook_conflict_kind:"unexplained-source-disagreement"},
    {...base,id:"pending",game_clock:"04:00",match_reason:"matched-official-log-video-game-id"},
  ];
  await page.route("**/rest/v1/**",route=>route.fulfill({json:route.request().url().includes("nba_authoritative_coach_challenge_events")?rows:[]}));
  await page.route("**/functions/v1/**",route=>route.fulfill({json:{}}));
  await page.route("**/api/**",route=>route.fulfill({json:[]}));
  await page.goto("#/officiating?tab=challenge-log&season=2026-27");
  await expect(page.getByText("3 need investigation · 1 have an unpublished whistle",{exact:false})).toBeVisible();
  const filter=page.getByLabel("Review",{exact:true});
  await filter.selectOption("needs_review");
  await expect(page.getByRole("cell",{name:"Whistle unavailable",exact:true})).toHaveCount(0);
  for(const [state,label]of [["whistle_unavailable","Whistle unavailable"],["original_whistle_unverified","Original whistle unverified"],
    ["source_conflict","Source conflict"],["gamebook_pending","Gamebook match pending"]]){
    await filter.selectOption(state);
    await expect(page.getByRole("cell",{name:label,exact:true})).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(1);
  }
});
