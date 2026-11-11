import { test, expect } from "@playwright/test";

const html = `<h1>NBA Referee Assignments</h1><table>
  <tr><th>Game</th><th>Crew Chief</th><th>Referee</th><th>Umpire</th></tr>
  <tr><td>Washington @ Atlanta</td><td>Ray Acosta (#54)</td><td>John Butler (#30)</td><td>Phenizee Ransom (#70)</td></tr>
</table><h1>G League Referee Assignments</h1><table>
  <tr><td>Capital City @ Delaware</td><td>Italo Araujo (#19)</td><td>Joe Prince (#78)</td><td>Emily Murphy (#27)</td></tr>
  <tr><td>Valley @ San Diego</td><td>Cameron Garber (#33)</td><td>Quincy Smith (#39)</td><td>Ashley Birch (#16)</td></tr>
</table><table><tr><td>Other content</td><td>Not</td><td>A</td><td>Crew</td></tr></table>`;

for (const variant of ["regular", "atc"]) {
  test(`G League ${variant} dashboard uses the second assignment table when proxies fail`, async ({ page }) => {

    await page.route("**/functions/v1/**", route => route.fulfill({ json: {} }));
    await page.route("**/functions/v1/game-metadata", route => {
      const body = route.request().postDataJSON();
      if (!(body.primaryGameId || body.liveGameId)) return route.fulfill({ status: 503, json: {} });
      return route.fulfill({ json: { game: {
        gameId: "2052600002", gameStatus: 1, period: 0,
        gameEt: new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()) + "T19:00:00",
        awayTeam: { teamId: "1612709928", teamCity: "Capital City", teamName: "Go-Go", teamTricode: "CCG", score: 0 },
        homeTeam: { teamId: "1612709909", teamCity: "Delaware", teamName: "Blue Coats", teamTricode: "DEL", score: 0 },
        officials: [], callsAgainst: null, playByPlayActions: [],
        boxScore: { away: { players: [], totals: {} }, home: { players: [], totals: {} } },
        teamStats: { away: {}, home: {} },
      } } });
    });
    await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
    await page.route("**/boxscore_*.json", route => route.fulfill({ json: {} }));
    // All assignment proxies fail; only the official page is available.
    await page.route(/referee-assignments/, route => {
      if (route.request().url() === "https://official.nba.com/referee-assignments/") {
        return route.fulfill({ contentType: "text/html", body: html });
      }
      return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    });
    await page.goto(`#/g/2052600002${variant === "atc" ? "/atc" : ""}`);
    const officials = page.getByRole("region", { name: "Tonight's officials" });
    await expect(officials).toBeVisible();
    for (const name of ["Italo Araujo", "Joe Prince", "Emily Murphy"]) {
      await expect(officials.getByText(new RegExp(name))).toBeVisible();
    }
    await expect(officials.getByText("Crew Chief", { exact: true })).toBeVisible();
    await expect(officials.getByText(/Ray Acosta|Cameron Garber/)).toHaveCount(0);
    // NBA assignments remain accessible from the first table too.
    const nba = await page.evaluate(async () => {
      const { fetchPublishedAssignmentForGame } = await import("/nbadash/src/officialAssignments.js");
      return fetchPublishedAssignmentForGame({
        awayTeam: { teamCity: "Washington", teamName: "Wizards" },
        homeTeam: { teamCity: "Atlanta", teamName: "Hawks" },
      });
    });
    expect(nba.crew.map(official => official.name)).toEqual(["Ray Acosta", "John Butler", "Phenizee Ransom"]);
  });
}
