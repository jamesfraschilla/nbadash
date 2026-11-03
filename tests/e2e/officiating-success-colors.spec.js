import { expect, test } from "@playwright/test";

test("teams with perfect small-sample success rates are green, not null-rank red", async ({ page }) => {
  await page.route("**/rest/v1/**", route => {
    const table = new URL(route.request().url()).pathname.split("/").at(-1);
    const data = table === "nba_team_profiles_cache" ? [
      {season:"2026-27",team:"DET",games:7,challenges:4,successful_challenges:4,challenge_rate:1},
      {season:"2026-27",team:"PHX",games:7,challenges:1,successful_challenges:1,challenge_rate:1},
      {season:"2026-27",team:"DAL",games:7,challenges:7,successful_challenges:6,challenge_rate:6/7},
    ] : [];
    return route.fulfill({json:data});
  });
  await page.route("**/api/**", route => route.fulfill({json:[]}));
  await page.goto("#/officiating?tab=teams&season=2026-27");
  for (const team of ["DET", "PHX"]) {
    const row = page.getByRole("row").filter({has:page.getByRole("button",{name:team,exact:true})});
    const pill = row.getByText("100.0%",{exact:true});
    await expect(pill).toBeVisible();
    await expect(pill).toHaveCSS("color", "rgb(169, 249, 193)");
    await expect(pill).toHaveAttribute("title",/observed success percentage, not percentile rank/);
  }
  await page.screenshot({path:"output/officiating-success-colors.png",fullPage:true});
});
