# Officials Report: Trends and Insights

## Product contract

- Generate insights only for a scheduled Washington Wizards game and its assigned three-person crew.
- Show two to four verified bullets per official.
- Permit a combined-crew finding when the three officials share a meaningful tendency or their tendencies intersect with the matchup.
- Do not repeat a metric already printed on the report unless it is an extreme outlier.
- Do not create a bullet solely to fill space. If fewer than two findings survive validation, show that verified insights are unavailable and record the reason.
- Never ask the language model to calculate a statistic.

## Processing flow

1. After the daily play-by-play and assignment ingestion succeeds, build one evidence snapshot for the next Wizards game.
2. Calculate candidate findings in SQL or deterministic application code from season-scoped rollups and game-level facts.
3. Attach the exact scope, numerator, denominator, sample size, comparison population, source version, and supporting game IDs to every candidate.
4. Reject candidates that fail sample-size, completeness, freshness, or consistency checks.
5. Send only the surviving candidate IDs and their verified display text to OpenAI. The model may select and order candidates; it may not calculate values or introduce a number that is absent from the evidence.
6. Validate the structured response against the candidate IDs and enforce two to four unique bullets per official.
7. Cache the approved result by game ID, crew IDs, evidence version, and prompt version. Report views and PDF exports read the cache and do not regenerate content.

## Candidate scopes

Each finding must state its scope explicitly. Useful scopes include:

- 2024-present regular season and playoffs
- Current season
- Last 10 officiated games versus the official's longer baseline
- Home-team and road-team splits
- Period and clutch-time splits
- Wizards games since 2024
- Current opponent games and matchup profile
- Games worked by the assigned crew members together, when the sample is sufficient

## Candidate families

- Call-frequency movement by normalized foul or violation category
- Home/road net-call and free-throw differentials
- Period concentration, including fourth-quarter and clutch tendencies
- Game scoring, total fouls, and free-throw attempt environment
- Challenge outcomes for the full crew or crew chief when the sample is sufficient
- Wizards-specific tendencies that are not already visible on the report
- Matchup intersections, such as restricted-area foul frequency against an opponent with high rim frequency, or three-point foul frequency against a high-volume three-point offense
- Shared or offsetting crew tendencies
- Direct official-to-player call concentration, such as an official accounting for an unusually large share of a player's counted technical fouls

## Accuracy rules

- Exclude preseason assignments and events from all calculations.
- Exclude alternates from officiating denominators and crew calculations.
- Use the same normalized category definitions and eligible-official rules as the profile and report metrics.
- Rank and calculate percentiles from unrounded values; round only for display.
- Require complete assignment and call-event coverage for every game used in a trend.
- Require a minimum game or event sample appropriate to the claim. Store the threshold with the candidate.
- Suppress a matchup intersection when the opponent metric is stale, missing, or from a different season/scope.
- Compare generated numeric tokens with the evidence payload before saving.
- Preserve supporting game IDs so an admin audit can reproduce every bullet.
- Require direct player and official identifiers for player-specific call claims; never infer the whistle from crew membership.
- Keep player box-score intersections (scoring, free throws, rim attempts, foul trouble, and similar trends) disabled until `nba_player_game_facts` contains complete player-game denominators. Any future crew association must be labeled as crew-game context and must not imply whistle attribution.

## OpenAI response contract

Use the Responses API with strict Structured Outputs. The response should contain only:

- official ID
- two to four selected candidate IDs
- optional selected combined-crew candidate ID
- selection rationale for logs only

The final report prose should come from deterministic, reviewed templates attached to each candidate. This keeps calculations and numbers outside the model while still using the model to choose the most useful combination of findings.

## Efficiency

- Generate once per Wizards game, after source ingestion, rather than on page load or PDF export.
- Store a compact evidence snapshot and final candidate IDs, not duplicated raw play-by-play rows.
- Refresh only the affected current-season evidence when new games arrive.
- Reuse existing team analytics rollups for opponent rim frequency, three-point frequency, pace, free-throw rate, and related matchup context.
- Use a stable prompt prefix and place dynamic evidence last so repeated requests can benefit from prompt caching.

## Deferred crew section

Crew-wide candidates remain separate from individual-official insights. Do not repeat the same crew observation in all three official cards; reserve it for a future dedicated Crew Insights section.
