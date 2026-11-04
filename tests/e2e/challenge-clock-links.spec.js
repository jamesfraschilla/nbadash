import {test,expect} from "@playwright/test";
test("recovered Clock links remain usable while referee attribution and PDF Video are unavailable",async({page})=>{
  const clip="https://clips.nba.com/?gameNo=0022600162&inTime=21403600&outTime=21405600&source=grs";
  await page.route("**/rest/v1/**",route=>{
    const table=new URL(route.request().url()).pathname.split("/").at(-1);
    return route.fulfill({json:table==="nba_authoritative_coach_challenge_events_cache"?[{
      id:"recovered",season:"2026-27",season_type:"Regular Season",game_id:"0022600162",game_date:"2026-11-02",
      away_team:"WAS",home_team:"ORL",challenging_team:"WAS",period:4,game_clock:"PT03M59.00S",
      challenge_type:"Foul",challenge_sub_type:"Foul on Floor",challenge_outcome:"successful",
      review_status:"needs_review",source:"play_by_play",clock_clip_url:clip,clock_link_version:"4",
    }]:[]});
  });
  await page.route("**/api/**",route=>route.fulfill({json:[]}));
  await page.goto("#/officiating?tab=challenge-log&season=2026-27");
  const link=page.getByRole("link",{name:"03:59",exact:true});
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href",clip);
  await expect(page.getByRole("link",{name:"Video",exact:true})).toHaveCount(0);
});
