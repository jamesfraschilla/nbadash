import { useMemo, useState } from "react";
import { requestNbaAnalyticsReport } from "../analyticsReportData.js";
import { teamLogoUrl } from "../api.js";
import PlayerHeadshot from "../components/PlayerHeadshot.jsx";
import { NBA_TEAMS } from "../data/nbaTeams.js";
import styles from "./AnalyticsReport.module.css";

const DEFAULT_TEAM_ID = "1610612764";
const LAST_GAME_OPTIONS = [5, 10, 15, 20, 30];

function defaultReportSeason(date = new Date()) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const startYear = month >= 10 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function buildSeasonOptions(date = new Date()) {
  const current = defaultReportSeason(date);
  const startYear = Number.parseInt(current.slice(0, 4), 10);
  return Array.from({ length: 5 }, (_, index) => {
    const year = startYear - index;
    return `${year}-${String(year + 1).slice(-2)}`;
  });
}

function formatGeneratedAt(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "numeric",
      day: "numeric",
      year: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return String(value || "");
  }
}

function rankClass(rank) {
  const value = Number(rank);
  if (!Number.isFinite(value)) return styles.rankNeutral;
  if (value <= 10) return styles.rankElite;
  if (value <= 40) return styles.rankGood;
  if (value <= 60) return styles.rankNeutral;
  if (value <= 90) return styles.rankConcern;
  return styles.rankPoor;
}

function ReportRow({ row }) {
  return (
    <div className={styles.reportRow}>
      <div className={styles.rowText}>{row.text}</div>
      <div className={`${styles.rankBadge} ${rankClass(row.rank)}`}>
        {row.rank ?? "-"}
      </div>
      <div className={styles.keyStat}>{row.displayValue}</div>
      <div className={styles.categoryPill}>{row.statLabel || row.category}</div>
    </div>
  );
}

function ReportSection({ section }) {
  if (!section?.rows?.length) return null;
  return (
    <section className={styles.reportSection}>
      <h3>{section.title}</h3>
      <div className={styles.reportRows}>
        {section.rows.map((row, index) => (
          <ReportRow key={`${section.title}-${row.statLabel}-${index}`} row={row} />
        ))}
      </div>
    </section>
  );
}

function ReportBlock({ title, subtitle, report }) {
  const sections = Array.isArray(report?.sections) ? report.sections : [];
  if (!sections.length) return null;
  return (
    <section className={styles.reportBlock}>
      <div className={styles.blockHeader}>
        <div>
          <div className={styles.kicker}>{subtitle}</div>
          <h2>{title}</h2>
        </div>
        <div className={styles.rankHeader}>%RANK / KEY STATS</div>
      </div>
      {sections.map((section) => (
        <ReportSection key={section.title} section={section} />
      ))}
    </section>
  );
}

function SplitTable({ rows }) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return (
    <div className={styles.splitWrap}>
      <table className={styles.splitTable}>
        <thead>
          <tr>
            <th>Split</th>
            <th>MPG</th>
            <th>PPG</th>
            <th>FGM/A</th>
            <th>FG%</th>
            <th>3PM/A</th>
            <th>3P%</th>
            <th>FTM/A</th>
            <th>FT%</th>
            <th>OFF</th>
            <th>DEF</th>
            <th>TOT</th>
            <th>APG</th>
            <th>TO</th>
            <th>BLK</th>
            <th>STL</th>
            <th>PF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.mpg}</td>
              <td>{row.ppg}</td>
              <td>{row.fgmA}</td>
              <td>{row.fgPct}</td>
              <td>{row.threePmA}</td>
              <td>{row.threePct}</td>
              <td>{row.ftmA}</td>
              <td>{row.ftPct}</td>
              <td>{row.off}</td>
              <td>{row.def}</td>
              <td>{row.tot}</td>
              <td>{row.apg}</td>
              <td>{row.to}</td>
              <td>{row.blk}</td>
              <td>{row.stl}</td>
              <td>{row.pf}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlayerReport({ report, defaultOpen, forceOpen = false }) {
  const player = report?.player || {};
  const cards = Array.isArray(report?.cards) ? report.cards : [];
  const initials = String(player.name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <details className={styles.playerPanel} open={defaultOpen || forceOpen}>
      <summary className={styles.playerSummary}>
        <div className={styles.playerIdentity}>
          <PlayerHeadshot
            personId={player.playerId}
            teamId={player.teamId}
            className={styles.playerHeadshot}
            fallback={<div className={styles.playerHeadshotFallback}>{initials}</div>}
          />
          <div>
            <div className={styles.kicker}>{player.teamAbbreviation || "NBA"}</div>
            <h3>{player.name}</h3>
          </div>
        </div>
        <div className={styles.playerMeta}>
          {cards.slice(0, 3).map((card) => (
            <span key={card.label}>{card.label}: {card.value}</span>
          ))}
        </div>
      </summary>

      <div className={styles.playerBody}>
        <div className={styles.cardGrid}>
          {cards.map((card) => (
            <div key={card.label} className={styles.metricCard}>
              <div className={styles.cardLabel}>{card.label}</div>
              <div className={styles.cardValue}>{card.value}</div>
              {card.rank ? <div className={styles.cardRank}>NBA Rank {card.rank}</div> : null}
            </div>
          ))}
        </div>

        <SplitTable rows={report.splitRows} />

        {(Array.isArray(report.sections) ? report.sections : []).map((section) => (
          <ReportSection key={`${player.playerId}-${section.title}`} section={section} />
        ))}
      </div>
    </details>
  );
}

export default function AnalyticsReport() {
  const seasonOptions = useMemo(() => buildSeasonOptions(), []);
  const [draft, setDraft] = useState({
    teamId: DEFAULT_TEAM_ID,
    season: seasonOptions[0],
    seasonType: "Regular Season",
    lastNGames: "10",
  });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [printExpanded, setPrintExpanded] = useState(false);

  const selectedTeam = NBA_TEAMS.find((team) => team.teamId === draft.teamId) || NBA_TEAMS[0];
  const playerReports = Array.isArray(report?.playerReports) ? report.playerReports : [];

  const updateDraft = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
  };

  const handleGenerate = async () => {
    if (!draft.teamId || loading) return;
    setLoading(true);
    setError("");
    try {
      const nextReport = await requestNbaAnalyticsReport({
        teamId: draft.teamId,
        season: draft.season,
        seasonType: draft.seasonType,
        lastNGames: Number.parseInt(draft.lastNGames, 10) || 10,
      });
      setReport(nextReport);
    } catch (requestError) {
      setError(requestError?.message || "Unable to generate analytics report.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = () => {
    if (!report || typeof window === "undefined" || typeof document === "undefined") return;

    const previousTitle = document.title;
    const teamLabel = report.team?.tricode || selectedTeam.tricode || "NBA";
    const windowLabel = `${report.selection?.lastNGames || draft.lastNGames || 10} Games`;
    document.title = `${teamLabel} Insight Report - ${windowLabel}`;
    document.body.classList.add("analytics-report-print");
    setPrintExpanded(true);

    const cleanup = () => {
      document.body.classList.remove("analytics-report-print");
      document.title = previousTitle;
      setPrintExpanded(false);
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        window.print();
      }, 50);
    });
  };

  return (
    <div className={styles.analyticsTool}>
      <section className={styles.setupPanel}>
        <div className={styles.setupGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Team</span>
            <select
              className={styles.select}
              value={draft.teamId}
              onChange={(event) => updateDraft({ teamId: event.target.value })}
            >
              {NBA_TEAMS.map((team) => (
                <option key={team.teamId} value={team.teamId}>{team.fullName}</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Season</span>
            <select
              className={styles.select}
              value={draft.season}
              onChange={(event) => updateDraft({ season: event.target.value })}
            >
              {seasonOptions.map((season) => (
                <option key={season} value={season}>{season}</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Season Type</span>
            <select
              className={styles.select}
              value={draft.seasonType}
              onChange={(event) => updateDraft({ seasonType: event.target.value })}
            >
              <option value="Regular Season">Regular Season</option>
              <option value="Playoffs">Playoffs</option>
              <option value="Pre Season">Preseason</option>
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Window</span>
            <select
              className={styles.select}
              value={draft.lastNGames}
              onChange={(event) => updateDraft({ lastNGames: event.target.value })}
            >
              {LAST_GAME_OPTIONS.map((count) => (
                <option key={count} value={String(count)}>Last {count} Games</option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.actionRow}>
          <div className={styles.sourceNote}>
            Uses public NBA Stats data. Situational PPP is excluded for now.
          </div>
          <button
            type="button"
            className={styles.generateButton}
            onClick={handleGenerate}
            disabled={loading || !draft.teamId}
          >
            {loading ? "Generating..." : "Generate Report"}
          </button>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}
      </section>

      {report ? (
        <section className={`${styles.reportShell} ${styles.analyticsPrintRoot}`}>
          <section className={styles.printCover}>
            <div className={styles.printTopRule} />
            <div className={styles.printCoverIdentity}>
              <img src={teamLogoUrl(report.team?.teamId || draft.teamId, "nba")} alt="" />
              <div>
                <div className={styles.printCoverTeam}>{report.team?.fullName || selectedTeam.fullName}</div>
                <h1>Advanced Insights Report</h1>
                <p>{report.selection?.rangeLabel}</p>
              </div>
            </div>
            <div className={styles.printCoverGrid}>
              <div>
                <h2>Team Breakdown</h2>
                <p>Team offense, opponent tendencies, shot profile, scoring mix, rank context, and key stats.</p>
              </div>
              <div>
                <h2>Player Breakdowns</h2>
                <p>Split tables, usage indicators, scoring mix, shooting zones, on/off impact, and team rank context.</p>
              </div>
            </div>
            <div className={styles.printCoverNote}>
              Situational Points Per Possession is excluded from this version until Synergy access is available.
            </div>
          </section>

          <header className={styles.reportHeader}>
            <div className={styles.teamIdentity}>
              <img src={teamLogoUrl(report.team?.teamId || draft.teamId, "nba")} alt="" />
              <div>
                <div className={styles.kicker}>{report.selection?.rangeLabel}</div>
                <h1>{report.team?.fullName || selectedTeam.fullName} Insight Report</h1>
              </div>
            </div>
            <div className={styles.reportHeaderActions}>
              <div className={styles.generatedAt}>
                Generated {formatGeneratedAt(report.generatedAt)}
              </div>
              <button type="button" className={styles.exportButton} onClick={handleExportPdf}>
                Export PDF
              </button>
            </div>
          </header>

          {Array.isArray(report.notes) && report.notes.length ? (
            <div className={styles.notesBar}>
              {report.notes.map((note) => (
                <span key={note}>{note}</span>
              ))}
            </div>
          ) : null}

          <ReportBlock
            title={`${report.team?.fullName || selectedTeam.fullName} Team Report`}
            subtitle="Team Breakdown"
            report={report.teamReport}
          />
          <ReportBlock
            title="Opponent Report"
            subtitle="Defensive Breakdown"
            report={report.opponentReport}
          />

          {playerReports.length ? (
            <section className={styles.playersBlock}>
              <div className={styles.blockHeader}>
                <div>
                  <div className={styles.kicker}>Player Breakdowns</div>
                  <h2>{playerReports.length} Players</h2>
                </div>
                <div className={styles.rankHeader}>RANK TEAM / KEY STATS</div>
              </div>
              <div className={styles.playerList}>
                {playerReports.map((playerReport, index) => (
                  <PlayerReport
                    key={playerReport.player?.playerId || playerReport.player?.name}
                    report={playerReport}
                    defaultOpen={index < 3}
                    forceOpen={printExpanded}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </section>
      ) : (
        <section className={styles.emptyState}>
          <h2>{selectedTeam.fullName}</h2>
          <p>Generate a report to review team trends, opponent tendencies, and player breakdowns for the selected game window.</p>
        </section>
      )}
    </div>
  );
}
