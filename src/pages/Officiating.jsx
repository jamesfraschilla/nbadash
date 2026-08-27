import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";
import { fetchOfficiatingDashboardData } from "../officiatingData.js";
import { loadRefereeHeadshotUrl } from "../refereeHeadshots.js";
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

function formatNumber(value, decimals = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return decimals ? "0.0" : "0";
  return number.toFixed(decimals);
}

function sortRows(rows, sort, fallbackKey = "") {
  return [...rows].sort((left, right) => {
    const direction = sort.direction === "asc" ? 1 : -1;
    const leftValue = left[sort.key];
    const rightValue = right[sort.key];
    const leftNumber = Number(leftValue);
    const rightNumber = Number(rightValue);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return (leftNumber - rightNumber) * direction;
    }
    const textCompare = String(leftValue || "").localeCompare(String(rightValue || ""));
    if (textCompare !== 0) return textCompare * direction;
    return String(left[fallbackKey] || "").localeCompare(String(right[fallbackKey] || ""));
  });
}

function SortButton({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      className={styles.sortButton}
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label}`}
    >
      {label}{active ? (sort.direction === "asc" ? " ^" : " v") : ""}
    </button>
  );
}

function ProfileMetric({ label, value, detail }) {
  return (
    <div className={styles.profileMetric}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <em>{detail}</em> : null}
    </div>
  );
}

function TopList({ title, items }) {
  const entries = Object.entries(items || {})
    .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
    .slice(0, 8);
  if (!entries.length) return null;
  return (
    <section className={styles.detailBlock}>
      <h3>{title}</h3>
      <div className={styles.splitList}>
        {entries.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function RefereeHeadshot({ name }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadRefereeHeadshotUrl(name).then((url) => {
      if (!cancelled) setSrc(url || "");
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  return (
    <div className={styles.headshot}>
      {src ? <img src={src} alt="" /> : <span>{String(name || "?").charAt(0)}</span>}
    </div>
  );
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

function OfficialsTable({ rows, sort, onSort, onSelect }) {
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
            <th><SortButton label="Official" sortKey="name" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Games" sortKey="games" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Calls" sortKey="calls" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Calls/G" sortKey="callsPerGame" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Fouls" sortKey="fouls" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Violations" sortKey="violations" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Challenges" sortKey="challenges" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Overturn Rate" sortKey="challengeRate" sort={sort} onSort={onSort} /></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={styles.clickableRow} onClick={() => onSelect(row)}>
              <td>
                <strong>{row.name}</strong>
                {row.jerseyNumber ? <span>#{row.jerseyNumber}</span> : null}
              </td>
              <td>{row.games}</td>
              <td>{row.calls}</td>
              <td>{formatNumber(row.callsPerGame, 1)}</td>
              <td>{row.fouls}</td>
              <td>{row.violations}</td>
              <td>{row.challenges}</td>
              <td>{formatRate(row.challengeRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamsTable({ rows, sort, onSort, onSelect }) {
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
            <th><SortButton label="Team" sortKey="team" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Calls Against" sortKey="callsAgainst" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Calls For" sortKey="callsFor" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Challenges" sortKey="challenges" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Successful" sortKey="successfulChallenges" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Success Rate" sortKey="challengeRate" sort={sort} onSort={onSort} /></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.team} className={styles.clickableRow} onClick={() => onSelect(row)}>
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

function ChallengeLog({ rows, sort, onSort }) {
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
            <th><SortButton label="Date" sortKey="game_date" sort={sort} onSort={onSort} /></th>
            <th>Game</th>
            <th><SortButton label="Team" sortKey="challenging_team" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Clock" sortKey="period" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Type" sortKey="challenge_type" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Outcome" sortKey="challenge_outcome" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Official" sortKey="whistling_official_name" sort={sort} onSort={onSort} /></th>
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

function MiniChallengeLog({ rows }) {
  if (!rows?.length) return <p className={styles.detailEmpty}>No challenge rows in the loaded dataset.</p>;
  return (
    <div className={styles.miniTableWrap}>
      <table className={styles.miniTable}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Game</th>
            <th>Clock</th>
            <th>Type</th>
            <th>Outcome</th>
            <th>Video</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || `${row.game_id}-${row.period}-${row.game_clock}-${index}`}>
              <td>{row.game_date || "-"}</td>
              <td>{[row.away_team, row.home_team].filter(Boolean).join(" @ ") || row.game_id}</td>
              <td>{row.period ? `Q${row.period} ${row.game_clock || ""}` : row.game_clock || "-"}</td>
              <td>{row.challenge_type || "-"}</td>
              <td>{row.challenge_outcome || "-"}</td>
              <td>{row.video_url ? <a href={row.video_url} target="_blank" rel="noreferrer">Watch</a> : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OfficialProfile({ profile, onClose }) {
  if (!profile) return null;
  return (
    <section className={styles.profilePanel}>
      <div className={styles.profileHeader}>
        <RefereeHeadshot name={profile.name} />
        <div>
          <div className={styles.kicker}>Referee Profile</div>
          <h2>{profile.name}</h2>
          <p>{profile.jerseyNumber ? `#${profile.jerseyNumber}` : "NBA official"}</p>
        </div>
        <button type="button" className={styles.closeButton} onClick={onClose}>Close</button>
      </div>
      <div className={styles.profileMetrics}>
        <ProfileMetric label="Games" value={profile.games} />
        <ProfileMetric label="Calls" value={profile.calls} detail={`Rank ${profile.callsRank || "-"}`} />
        <ProfileMetric label="Calls/G" value={formatNumber(profile.callsPerGame, 1)} detail={`Rank ${profile.callsPerGameRank || "-"}`} />
        <ProfileMetric label="Challenges" value={profile.challenges} />
        <ProfileMetric label="Overturn Rate" value={formatRate(profile.challengeRate)} detail={`Rank ${profile.challengeRateRank || "-"}`} />
      </div>
      <div className={styles.detailGrid}>
        <TopList title="Calls By Team" items={profile.callsByTeam} />
        <TopList title="Calls By Category" items={profile.callsByCategory} />
      </div>
      <section className={styles.detailBlock}>
        <h3>Season Schedule</h3>
        <div className={styles.splitList}>
          {(profile.schedule || []).slice(0, 12).map((row) => (
            <div key={`${row.game_id}-${row.official_id}-${row.role_key}`}>
              <span>{row.game_date} - {[row.away_team, row.home_team].filter(Boolean).join(" @ ")}</span>
              <strong>{row.role_key === "crewChief" ? "Crew Chief" : `Official ${row.assignment_order || ""}`}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className={styles.detailBlock}>
        <h3>Challenge Log</h3>
        <MiniChallengeLog rows={profile.challengeLog || []} />
      </section>
    </section>
  );
}

function TeamProfile({ profile, onClose }) {
  if (!profile) return null;
  return (
    <section className={styles.profilePanel}>
      <div className={styles.profileHeader}>
        <div className={styles.teamMark}>{profile.team}</div>
        <div>
          <div className={styles.kicker}>Team Profile</div>
          <h2>{profile.team}</h2>
          <p>Challenge profile, call trends, and recent event log.</p>
        </div>
        <button type="button" className={styles.closeButton} onClick={onClose}>Close</button>
      </div>
      <div className={styles.profileMetrics}>
        <ProfileMetric label="Calls Against" value={profile.callsAgainst} detail={`Rank ${profile.callsAgainstRank || "-"}`} />
        <ProfileMetric label="Calls For" value={profile.callsFor} />
        <ProfileMetric label="Challenges" value={profile.challenges} detail={`Rank ${profile.challengesRank || "-"}`} />
        <ProfileMetric label="Successful" value={profile.successfulChallenges} />
        <ProfileMetric label="Success Rate" value={formatRate(profile.challengeRate)} detail={`Rank ${profile.challengeRateRank || "-"}`} />
      </div>
      <div className={styles.detailGrid}>
        <TopList title="Calls By Official" items={profile.callsByOfficial} />
        <TopList title="Calls By Category" items={profile.callsByCategory} />
      </div>
      <section className={styles.detailBlock}>
        <h3>Challenge Log</h3>
        <MiniChallengeLog rows={profile.challengeLog || []} />
      </section>
    </section>
  );
}

export default function Officiating() {
  const [params, setParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const selectedTab = params.get("tab") || "tonight";
  const [officialSort, setOfficialSort] = useState({ key: "calls", direction: "desc" });
  const [teamSort, setTeamSort] = useState({ key: "challenges", direction: "desc" });
  const [challengeSort, setChallengeSort] = useState({ key: "game_date", direction: "desc" });
  const [selectedOfficial, setSelectedOfficial] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
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
  const sortedOfficials = useMemo(
    () => sortRows(data?.officialProfiles || [], officialSort, "name"),
    [data?.officialProfiles, officialSort]
  );
  const sortedTeams = useMemo(
    () => sortRows(data?.teamProfiles || [], teamSort, "team"),
    [data?.teamProfiles, teamSort]
  );
  const sortedChallenges = useMemo(
    () => sortRows(data?.challengeLog || [], challengeSort, "game_id"),
    [data?.challengeLog, challengeSort]
  );

  const toggleSort = (setter) => (key) => {
    setter((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  };

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
        <>
          <OfficialsTable
            rows={sortedOfficials}
            sort={officialSort}
            onSort={toggleSort(setOfficialSort)}
            onSelect={setSelectedOfficial}
          />
          <OfficialProfile profile={selectedOfficial} onClose={() => setSelectedOfficial(null)} />
        </>
      ) : activeTab === "teams" ? (
        <>
          <TeamsTable
            rows={sortedTeams}
            sort={teamSort}
            onSort={toggleSort(setTeamSort)}
            onSelect={setSelectedTeam}
          />
          <TeamProfile profile={selectedTeam} onClose={() => setSelectedTeam(null)} />
        </>
      ) : activeTab === "challenge-log" ? (
        <ChallengeLog rows={sortedChallenges} sort={challengeSort} onSort={toggleSort(setChallengeSort)} />
      ) : (
        <EmptyPanel title="Review Queue">
          Low-confidence official matches and challenge matches will appear here for admin review.
        </EmptyPanel>
      )}
    </div>
  );
}
