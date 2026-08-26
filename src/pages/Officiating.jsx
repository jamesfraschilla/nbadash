import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";
import { fetchOfficiatingDashboardData } from "../officiatingData.js";
import styles from "./Officiating.module.css";

const TABS = [
  { key: "tonight", label: "Tonight's Officials" },
  { key: "officials", label: "All Officials" },
  { key: "teams", label: "Teams" },
  { key: "challenge-log", label: "Challenge Log" },
  { key: "review", label: "Review" },
];

const DEFAULT_SEASON = "2025-26";

function formatRate(value) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${(value * 100).toFixed(1)}%`;
}

function StatCard({ label, value, detail }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {detail ? <div className={styles.statDetail}>{detail}</div> : null}
    </div>
  );
}

function EmptyPanel({ title, children }) {
  return (
    <section className={styles.emptyPanel}>
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}

function OfficialsTable({ rows }) {
  if (!rows.length) {
    return (
      <EmptyPanel title="No official profiles yet">
        Deploy the Supabase schema and run the 2025-26 officiating backfill to populate official call profiles.
      </EmptyPanel>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Official</th>
            <th>Games</th>
            <th>Calls</th>
            <th>Fouls</th>
            <th>Violations</th>
            <th>Technicals</th>
            <th>Challenges</th>
            <th>Overturn Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.name}</strong>
                {row.jerseyNumber ? <span>#{row.jerseyNumber}</span> : null}
              </td>
              <td>{row.games}</td>
              <td>{row.calls}</td>
              <td>{row.fouls}</td>
              <td>{row.violations}</td>
              <td>{row.technicals}</td>
              <td>{row.challenges}</td>
              <td>{formatRate(row.challengeRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamsTable({ rows }) {
  if (!rows.length) {
    return (
      <EmptyPanel title="No team profiles yet">
        Team trends will appear after official-attributed call events and coach's challenge rows are backfilled.
      </EmptyPanel>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Team</th>
            <th>Calls Against</th>
            <th>Calls For</th>
            <th>Challenges</th>
            <th>Successful</th>
            <th>Success Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.team}>
              <td><strong>{row.team}</strong></td>
              <td>{row.callsAgainst}</td>
              <td>{row.callsFor}</td>
              <td>{row.challenges}</td>
              <td>{row.successfulChallenges}</td>
              <td>{formatRate(row.challengeRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChallengeLog({ rows }) {
  if (!rows.length) {
    return (
      <EmptyPanel title="No challenge log yet">
        The league-wide challenge log will populate from NBA challenge review data and matched play-by-play replay events.
      </EmptyPanel>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Game</th>
            <th>Team</th>
            <th>Clock</th>
            <th>Type</th>
            <th>Outcome</th>
            <th>Official</th>
            <th>Video</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || `${row.game_id}-${row.period}-${row.game_clock}-${index}`}>
              <td>{row.game_date || "-"}</td>
              <td>{[row.away_team, row.home_team].filter(Boolean).join(" @ ") || row.game_id || "-"}</td>
              <td>{row.challenging_team || "-"}</td>
              <td>{row.period ? `Q${row.period} ${row.game_clock || ""}` : row.game_clock || "-"}</td>
              <td>{row.challenge_type || "-"}</td>
              <td>{row.challenge_outcome || row.call_ruling || "-"}</td>
              <td>{row.whistling_official_name || row.crew_chief_name || "-"}</td>
              <td>
                {row.video_url ? (
                  <a href={row.video_url} target="_blank" rel="noreferrer">Watch</a>
                ) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Officiating() {
  const [params, setParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const selectedTab = params.get("tab") || "tonight";
  const activeTab = TABS.some((tab) => tab.key === selectedTab) && (selectedTab !== "review" || isAdmin)
    ? selectedTab
    : "tonight";
  const season = params.get("season") || DEFAULT_SEASON;

  const { data, isLoading, error } = useQuery({
    queryKey: ["officiating-dashboard", season],
    queryFn: () => fetchOfficiatingDashboardData({ season }),
    staleTime: 60_000,
    retry: 1,
  });

  const visibleTabs = useMemo(
    () => TABS.filter((tab) => tab.key !== "review" || isAdmin),
    [isAdmin]
  );
  const overview = data?.overview || {};

  const setTab = (tab) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", tab);
    setParams(nextParams);
  };

  return (
    <div className={styles.page}>
      <section className={styles.header}>
        <div>
          <div className={styles.kicker}>NBA Dashboard</div>
          <h1>Officiating Intelligence</h1>
          <p>
            Referee call profiles, Wizards game-day crew reports, team officiating trends, and coach's challenge logs.
          </p>
        </div>
        <label className={styles.seasonControl}>
          <span>Season</span>
          <select
            value={season}
            onChange={(event) => {
              const nextParams = new URLSearchParams(params);
              nextParams.set("season", event.target.value);
              setParams(nextParams);
            }}
          >
            <option value="2025-26">2025-26</option>
            <option value="2026-27">2026-27</option>
          </select>
        </label>
      </section>

      <section className={styles.statsGrid} aria-label="Officiating data summary">
        <StatCard label="Official Calls" value={overview.callEvents || 0} detail="official-attributed PBP events" />
        <StatCard label="Challenges" value={overview.challenges || 0} detail={`${overview.successfulChallenges || 0} successful`} />
        <StatCard label="Challenge Rate" value={formatRate(overview.challengeRate || 0)} detail="successful challenge share" />
        <StatCard label="Officials" value={overview.officials || 0} detail="assigned officials in dataset" />
        <StatCard label="Teams" value={overview.teams || 0} detail="teams with call/challenge rows" />
      </section>

      {data?.unavailable ? (
        <div className={styles.notice}>
          Officiating tables are not available yet. Apply `supabase/officiating_intelligence.sql`, then run the backfill.
        </div>
      ) : null}

      <nav className={styles.tabBar} aria-label="Officiating Intelligence tabs">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.tabButton} ${activeTab === tab.key ? styles.tabButtonActive : ""}`}
            onClick={() => setTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {isLoading ? (
        <EmptyPanel title="Loading officiating data">Fetching cached officiating summaries from Supabase.</EmptyPanel>
      ) : error ? (
        <EmptyPanel title="Unable to load officiating data">{error.message}</EmptyPanel>
      ) : activeTab === "tonight" ? (
        <EmptyPanel title="Tonight's Officials">
          This report will use Wizards game-day assignments once the ingestion job has populated official profiles.
        </EmptyPanel>
      ) : activeTab === "officials" ? (
        <OfficialsTable rows={data?.officialProfiles || []} />
      ) : activeTab === "teams" ? (
        <TeamsTable rows={data?.teamProfiles || []} />
      ) : activeTab === "challenge-log" ? (
        <ChallengeLog rows={data?.challengeLog || []} />
      ) : (
        <EmptyPanel title="Review Queue">
          Low-confidence official matches and challenge matches will appear here for admin review.
        </EmptyPanel>
      )}
    </div>
  );
}
