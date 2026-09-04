import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverChallengeReviewDocuments,
  discoverSeasonPageUrl,
  shouldRunWeeklyChallengeSync,
} from "./officiatingChallengeDiscovery.js";

test("discovers regular-season and playoff reviews-by-day PDFs", () => {
  const html = `
    <p><strong>PLAYOFFS</strong></p>
    <p><a href="https://cdn.example/playoffs.pdf">Coach&#8217;s Challenge reviews by day</a></p>
    <p><a href="https://cdn.example/playoff-totals.pdf">Coach's Challenge season totals</a></p>
    <p><strong>REGULAR SEASON</strong></p>
    <p><a href="/regular.pdf">Coach&#8217;s Challenge reviews by day</a></p>
  `;
  assert.deepEqual(discoverChallengeReviewDocuments(html, "https://official.nba.com/season/"), [
    {
      kind: "playoffs",
      label: "Coach's Challenge reviews by day",
      url: "https://cdn.example/playoffs.pdf",
    },
    {
      kind: "regular",
      label: "Coach's Challenge reviews by day",
      url: "https://official.nba.com/regular.pdf",
    },
  ]);
});

test("discovers a season page from the official archive", () => {
  const html = '<a href="/2026-27-nba-coachs-challenge-reviews/">2026-27 NBA Coach&#8217;s Challenge Reviews</a>';
  assert.equal(
    discoverSeasonPageUrl(html, "2026-27", "https://official.nba.com/archive/"),
    "https://official.nba.com/2026-27-nba-coachs-challenge-reviews/",
  );
});

test("weekly sync starts Sunday October 4 during the 5 AM Eastern hour", () => {
  assert.equal(shouldRunWeeklyChallengeSync({ now: new Date("2026-10-04T09:15:00Z") }), true);
  assert.equal(shouldRunWeeklyChallengeSync({ now: new Date("2026-10-04T08:15:00Z") }), false);
  assert.equal(shouldRunWeeklyChallengeSync({ now: new Date("2026-09-27T09:15:00Z") }), false);
  assert.equal(shouldRunWeeklyChallengeSync({ now: new Date("2026-10-05T09:15:00Z") }), false);
});
