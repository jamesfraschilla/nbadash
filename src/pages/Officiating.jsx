import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";
import {
  fetchOfficiatingChallengeLog,
  fetchChallengeContextTagOptions,
  fetchOfficialProfileDetails,
  fetchOfficialsReportData,
  fetchOfficiatingDashboardData,
  fetchTeamProfileDetails,
  saveChallengeContextTags,
} from "../officiatingData.js";
import {
  fetchPgrInsightsData,
  fetchPgrSmartInsightsReport,
  importPgrReport,
  resolvePgrGameMetadata,
} from "../pgrData.js";
import { nbaEventVideoUrl, teamLogoUrl } from "../api.js";
import { useGamesByDate } from "../queries.js";
import { formatDateInputInTimeZone } from "../utils.js";
import { CALL_CATEGORY_GROUPS } from "../officiatingCategoryNormalization.js";
import { loadRefereeHeadshotUrl } from "../refereeHeadshots.js";
import {
  CUMULATIVE_OFFICIATING_SEASON as CUMULATIVE_SEASON,
  OFFICIATING_SEASON_OPTIONS as SEASON_OPTIONS,
  currentOfficiatingSeasonDefault,
  defaultOfficiatingSeasonForTab,
} from "../officiatingSeasons.js";
import styles from "./Officiating.module.css";

const TABS = [
  { key: "tonight", label: "Tonight's Officials" },
  { key: "officials", label: "All Officials" },
  { key: "teams", label: "Teams" },
  { key: "challenge-log", label: "Challenge Log" },
  { key: "pgr-insights", label: "PGR Insights" },
];

const TONIGHT_REPORT_CREW = [
  { name: "James Williams", role: "Crew Chief" },
  { name: "JB DeRosa", role: "Referee" },
  { name: "Natalie Sago", role: "Umpire" },
];

function defaultSeasonForTab(tab) {
  return defaultOfficiatingSeasonForTab(tab);
}

function formatRate(value) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${(value * 100).toFixed(1)}%`;
}

function formatRateRecord(successes, attempts) {
  const total = Number(attempts) || 0;
  const made = Number(successes) || 0;
  return `${formatRate(total ? made / total : 0)} (${made}/${total})`;
}

function formatNumber(value, decimals = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return decimals ? (0).toFixed(decimals) : "0";
  return number.toFixed(decimals);
}

function isSuccessfulOutcome(value) {
  return ["successful", "overturned"].includes(String(value || "").trim().toLowerCase());
}

function OutcomeBadge({ value }) {
  const label = value || "-";
  if (!value) return label;
  return (
    <span className={`${styles.outcomeBadge} ${isSuccessfulOutcome(value) ? styles.outcomeGood : styles.outcomeBad}`}>
      {label}
    </span>
  );
}

function challengeClockLabel(row) {
  const value = String(row?.game_clock || row?.gameClock || "").trim();
  if (!value) return "-";
  const iso = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
  if (iso) {
    return `${String(Number(iso[1] || 0)).padStart(2, "0")}:${String(Math.floor(Number(iso[2] || 0))).padStart(2, "0")}`;
  }
  const mmss = /^(\d+):(\d+(?:\.\d+)?)$/.exec(value);
  if (mmss) {
    return `${String(Number(mmss[1])).padStart(2, "0")}:${String(Math.floor(Number(mmss[2]))).padStart(2, "0")}`;
  }
  return value;
}

function challengePbpVideoUrl(row) {
  const matcherPayload = row?.source_payload?.officialMatcher || row?.sourcePayload?.officialMatcher || {};
  const matchedCall = matcherPayload.matchedCall || {};
  const nearbyLocationContext = matcherPayload.nearbyLocationContext || {};
  const actionNumber = row?.matched_action_number
    ?? row?.matchedActionNumber
    ?? nearbyLocationContext.actionNumber
    ?? nearbyLocationContext.action_number;
  const title = matchedCall.description
    || nearbyLocationContext.description
    || row?.description
    || row?.initial_call
    || row?.initialCall
    || row?.challenge_type
    || row?.challengeType;
  return nbaEventVideoUrl({
    gameId: row?.game_id || row?.gameId,
    actionNumber,
    seasonYear: row?.season || row?.seasonYear,
    title,
  });
}

function ChallengeClockLink({ row }) {
  const label = challengeClockLabel(row);
  const url = challengePbpVideoUrl(row);
  if (!url) return label;
  return (
    <a href={url} target="_blank" rel="noreferrer" className={styles.inlineLink}>
      {label}
    </a>
  );
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

function optionValue(value) {
  return String(value ?? "").trim();
}

function uniqueOptions(rows, selector, formatter = (value) => value) {
  return [...new Set(rows.map(selector).map(optionValue).filter(Boolean))]
    .sort((left, right) => String(formatter(left)).localeCompare(String(formatter(right)), undefined, { numeric: true }));
}

function SortButton({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      className={styles.sortButton}
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label}${active ? `, currently ${sort.direction}` : ""}`}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
    >
      {label}
    </button>
  );
}

function ProfileMetric({ label, value, detail, style }) {
  return (
    <div className={styles.profileMetric} style={style}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <em>{detail}</em> : null}
    </div>
  );
}

function getTopListEntries(items) {
  return Object.entries(items || {})
    .filter(([label]) => !String(label || "").startsWith("__"))
    .map(([label, raw]) => {
      const value = typeof raw === "object" && raw !== null ? Number(raw.value) || 0 : Number(raw) || 0;
      const rank = typeof raw === "object" && raw !== null ? raw.rank : null;
      return [label, value, rank];
    })
    .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0));
}

function SortableTopList({
  title,
  items,
  labelHeader = "Category",
  valueHeader = "Value",
  onSelectLabel,
  valueFormatter = (value) => formatNumber(value, 2),
  defaultOpen = false,
  open,
  onOpenChange,
  isLoading = false,
}) {
  const [sort, setSort] = useState({ key: "value", direction: "desc" });
  const entries = useMemo(() => {
    const direction = sort.direction === "asc" ? 1 : -1;
    return getTopListEntries(items).sort((left, right) => {
      if (sort.key === "label") {
        const labelCompare = String(left[0] || "").localeCompare(String(right[0] || ""), undefined, { numeric: true });
        if (labelCompare !== 0) return labelCompare * direction;
      } else {
        const valueCompare = (Number(left[1]) || 0) - (Number(right[1]) || 0);
        if (valueCompare !== 0) return valueCompare * direction;
      }
      return String(left[0] || "").localeCompare(String(right[0] || ""), undefined, { numeric: true });
    });
  }, [items, sort]);
  const handleSort = (key) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  };
  const detailProps = {
    className: styles.detailBlock,
    onToggle: onOpenChange ? (event) => onOpenChange(event.currentTarget.open) : undefined,
  };
  if (open === undefined) detailProps.open = defaultOpen;
  else detailProps.open = open;
  if (!entries.length && !isLoading) return null;
  return (
    <details {...detailProps}>
      <summary>{title}</summary>
      {isLoading ? (
        <p className={styles.detailEmpty}>Loading profile details...</p>
      ) : (
      <div className={styles.profileListScroll}>
        <table className={styles.profileListTable}>
          <thead>
            <tr>
              <th><SortButton label={labelHeader} sortKey="label" sort={sort} onSort={handleSort} /></th>
              <th><SortButton label={valueHeader} sortKey="value" sort={sort} onSort={handleSort} /></th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([label, value, rank]) => (
              <tr key={label}>
                <td>
                  {onSelectLabel ? (
                    <button type="button" className={styles.inlineLink} onClick={() => onSelectLabel(label)}>
                      {label}
                    </button>
                  ) : (
                    <span>{label}</span>
                  )}
                </td>
                <td>
                  <strong>{valueFormatter(value)}{rank ? ` (${ordinal(rank)})` : ""}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </details>
  );
}

function itemValue(items, labels = []) {
  return labels.reduce((total, label) => {
    const raw = items?.[label];
    const value = typeof raw === "object" && raw !== null ? raw.value : raw;
    return total + (Number(value) || 0);
  }, 0);
}

function categoryMetricKey(labels = []) {
  return [...new Set(labels.map((label) => String(label || "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

function storedCategoryPercentile(items, labels = []) {
  const key = categoryMetricKey(labels);
  const displayPercentile = Number(items?.__displayPercentiles?.[key]) || null;
  if (displayPercentile) return displayPercentile;
  if (labels.length === 1) {
    const row = items?.[labels[0]];
    if (typeof row === "object" && row !== null) return Number(row.percentile) || null;
  }
  return null;
}

function categoryPercentile(items, labels = []) {
  return storedCategoryPercentile(items, labels);
}

function uniqueLabelValue(items, groups) {
  const labels = new Set();
  groups.forEach((group) => group.labels.forEach((label) => labels.add(label)));
  return itemValue(items, [...labels]);
}

function percentileFromRank(rank, populationSize) {
  const numericRank = Number(rank) || 0;
  const total = Number(populationSize) || 0;
  if (!numericRank || total <= 1) return null;
  return Math.max(1, Math.min(100, Math.round(((total - numericRank) / (total - 1)) * 99 + 1)));
}

function formatPercentile(rank, populationSize) {
  const percentile = percentileFromRank(rank, populationSize);
  return percentile ? `${ordinal(percentile)} percentile` : "Percentile --";
}

function formatPercentileValue(percentile) {
  return percentile ? `${ordinal(percentile)} percentile` : "Percentile --";
}

function formatCategoryMetric(value, percentile) {
  return `${formatNumber(value, 2)}${percentile ? ` (${percentile}%)` : ""}`;
}

function categoryMetric(items, labels) {
  const value = itemValue(items, labels);
  return {
    value,
    percentile: categoryPercentile(items, labels),
  };
}

function CategoryColumn({ group, items, sort, onSort, expanded, onToggle }) {
  const rows = useMemo(() => {
    const direction = sort.direction === "asc" ? 1 : -1;
    return group.types
      .map((type) => {
        const value = itemValue(items, type.labels);
        return {
          ...type,
          value,
          percentile: categoryPercentile(items, type.labels),
          subTypes: (type.subTypes || []).map((subType) => {
            const subTypeValue = itemValue(items, subType.labels);
            return {
              ...subType,
              value: subTypeValue,
              percentile: categoryPercentile(items, subType.labels),
            };
          }).filter((subType) => subType.value > 0),
        };
      })
      .filter((type) => type.value > 0)
      .sort((left, right) => {
        if (sort.key === "label") {
          const compare = left.label.localeCompare(right.label, undefined, { numeric: true });
          if (compare !== 0) return compare * direction;
        } else {
          const compare = left.value - right.value;
          if (compare !== 0) return compare * direction;
        }
        return left.label.localeCompare(right.label, undefined, { numeric: true });
      });
  }, [group, items, sort]);
  const total = uniqueLabelValue(items, group.types);
  const totalLabels = [...new Set(group.types.flatMap((type) => type.labels || []))];
  const totalPercentile = categoryPercentile(items, totalLabels);

  return (
    <section className={styles.categoryColumn}>
      <div className={styles.categoryColumnHeader}>
        <span>{group.title}</span>
        <strong>{formatCategoryMetric(total, totalPercentile)}</strong>
      </div>
      <div className={styles.categorySubhead}>
        <SortButton label="Call" sortKey="label" sort={sort} onSort={onSort} />
        <SortButton label="Calls/G" sortKey="value" sort={sort} onSort={onSort} />
      </div>
      <div className={styles.categoryRows}>
        {rows.map((row) => {
          const rowKey = `${group.key}:${row.label}`;
          const isExpanded = expanded.has(rowKey);
          const canExpand = row.subTypes.length > 0;
          return (
            <div key={rowKey} className={styles.categoryRowGroup}>
              <button
                type="button"
                className={`${styles.categoryRow} ${canExpand ? styles.expandableCategoryRow : ""}`}
                onClick={() => canExpand && onToggle(rowKey)}
                disabled={!canExpand}
              >
                <span>{canExpand ? (isExpanded ? "- " : "+ ") : ""}{row.label}</span>
                <strong>{formatCategoryMetric(row.value, row.percentile)}</strong>
              </button>
              {canExpand && isExpanded ? (
                <div className={styles.categorySubRows}>
                  {row.subTypes.map((subType) => (
                    <div key={`${rowKey}:${subType.label}`} className={styles.categorySubRow}>
                      <span>{subType.label}</span>
                      <strong>{formatCategoryMetric(subType.value, subType.percentile)}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CallsByCategoryBreakdown({ items, isLoading = false, open, onOpenChange }) {
  const [sorts, setSorts] = useState(() => Object.fromEntries(
    CALL_CATEGORY_GROUPS.map((group) => [group.key, { key: "value", direction: "desc" }])
  ));
  const [expanded, setExpanded] = useState(() => new Set());
  const hasData = CALL_CATEGORY_GROUPS.some((group) => uniqueLabelValue(items, group.types) > 0);
  const handleSort = (groupKey, key) => {
    setSorts((current) => {
      const groupSort = current[groupKey] || { key: "value", direction: "desc" };
      return {
        ...current,
        [groupKey]: {
          key,
          direction: groupSort.key === key && groupSort.direction === "desc" ? "asc" : "desc",
        },
      };
    });
  };
  const handleToggle = (rowKey) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  return (
    <details
      className={`${styles.detailBlock} ${styles.categoryBreakdownBlock}`}
      open={open}
      onToggle={onOpenChange ? (event) => onOpenChange(event.currentTarget.open) : undefined}
    >
      <summary>Calls By Category</summary>
      {isLoading ? (
        <p className={styles.detailEmpty}>Loading profile details...</p>
      ) : hasData ? (
        <div className={styles.categoryBreakdownGrid}>
          {CALL_CATEGORY_GROUPS.map((group) => (
            <CategoryColumn
              key={group.key}
              group={group}
              items={items}
              sort={sorts[group.key] || { key: "value", direction: "desc" }}
              onSort={(key) => handleSort(group.key, key)}
              expanded={expanded}
              onToggle={handleToggle}
            />
          ))}
        </div>
      ) : (
        <p className={styles.detailEmpty}>No mapped category rows in the loaded dataset.</p>
      )}
    </details>
  );
}

function RefereeHeadshot({ name, eager = false }) {
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
      {src ? <img src={src} alt="" loading={eager ? "eager" : "lazy"} decoding="async" /> : <span>{String(name || "?").charAt(0)}</span>}
    </div>
  );
}

function TeamLogo({ team, teamId, className = "" }) {
  const logoId = String(teamId || "").trim();
  return (
    <div className={`${styles.teamLogoMark} ${className}`}>
      {logoId ? <img src={teamLogoUrl(logoId)} alt="" /> : <span>{String(team || "?").slice(0, 3)}</span>}
    </div>
  );
}

function formatSignedDecimal(value, decimals = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return decimals ? (0).toFixed(decimals) : "0";
  return `${number > 0 ? "+" : ""}${number.toFixed(decimals)}`;
}

function ordinal(value) {
  const number = Number(value) || 0;
  if (!number) return "-";
  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${number}th`;
  const mod10 = number % 10;
  if (mod10 === 1) return `${number}st`;
  if (mod10 === 2) return `${number}nd`;
  if (mod10 === 3) return `${number}rd`;
  return `${number}th`;
}

function valueTone(value) {
  const number = Number(value) || 0;
  if (number > 0) return styles.positiveValue;
  if (number < 0) return styles.negativeValue;
  return styles.neutralValue;
}

function successRateStyle(rank) {
  const numericRank = Math.max(1, Math.min(30, Number(rank) || 30));
  const ratio = (numericRank - 1) / 29;
  const hue = 138 - ratio * 138;
  return {
    backgroundColor: `hsl(${hue} 70% 22% / 0.58)`,
    borderColor: `hsl(${hue} 70% 48% / 0.58)`,
    color: `hsl(${hue} 88% 82%)`,
  };
}

function metricToneStyle(rank, total) {
  const eligibleTotal = Math.max(1, Number(total) || 1);
  const numericRank = Math.max(1, Math.min(eligibleTotal, Number(rank) || eligibleTotal));
  const ratio = eligibleTotal === 1 ? 0 : (numericRank - 1) / (eligibleTotal - 1);
  const hue = 138 - ratio * 138;
  return {
    backgroundColor: `hsl(${hue} 68% 20% / 0.56)`,
    borderColor: `hsl(${hue} 70% 44% / 0.5)`,
    color: `hsl(${hue} 88% 84%)`,
  };
}

function metricToneClass(rank, total) {
  const eligibleTotal = Math.max(1, Number(total) || 1);
  const numericRank = Math.max(1, Math.min(eligibleTotal, Number(rank) || eligibleTotal));
  const ratio = eligibleTotal === 1 ? 0 : (numericRank - 1) / (eligibleTotal - 1);
  if (ratio <= 0.33) return styles.reportMetricGood;
  if (ratio <= 0.66) return styles.reportMetricNeutral;
  return styles.reportMetricBad;
}

function metricToneClassFromPercentile(percentile) {
  const value = Number(percentile) || 0;
  if (value >= 67) return styles.reportMetricGood;
  if (value >= 34) return styles.reportMetricNeutral;
  return styles.reportMetricBad;
}

function formatReportMetric(value) {
  return formatNumber(value, 2);
}

function formatShortDate(value) {
  const [year, month, day] = String(value || "").split("-").map((part) => Number(part));
  if (!year || !month || !day) return "";
  return `${month}/${day}`;
}

function formatReportGameDate(value) {
  const [year, month, day] = String(value || "").split("-").map((part) => Number(part));
  if (!year || !month || !day) return "";
  return `${month}/${day}/${year}`;
}

function reportTeamLocation(team) {
  const tricode = String(team?.teamTricode || "").trim();
  if (tricode === "WAS") return "Washington";
  return String(team?.teamCity || team?.teamName || tricode || "Opponent").trim();
}

function reportGameMetadata(game, fallbackDate) {
  const away = game?.awayTeam;
  const home = game?.homeTeam;
  const isWashingtonAway = String(away?.teamTricode || "").trim() === "WAS";
  const isWashingtonHome = String(home?.teamTricode || "").trim() === "WAS";
  if (!isWashingtonAway && !isWashingtonHome) {
    return {
      title: "Officials Report – Washington vs New York",
      date: "12/9/2026",
    };
  }
  const opponent = isWashingtonAway ? home : away;
  return {
    title: `Officials Report – Washington ${isWashingtonAway ? "@" : "vs"} ${reportTeamLocation(opponent)}`,
    date: formatReportGameDate(game?.gameDate || fallbackDate),
  };
}

function priorWizardsGames(schedule = []) {
  return schedule
    .filter((row) => {
      const away = String(row.away_team || "").trim();
      const home = String(row.home_team || "").trim();
      return row.season === "2025-26" && (away === "WAS" || home === "WAS");
    })
    .sort((left, right) => String(right.game_date || "").localeCompare(String(left.game_date || "")))
    .slice(0, 4)
    .map((row) => {
      const away = String(row.away_team || "").trim();
      const home = String(row.home_team || "").trim();
      const opponent = away === "WAS" ? home : away;
      const location = away === "WAS" ? "@" : "vs";
      return `${formatShortDate(row.game_date)} ${location} ${opponent}`;
    })
    .filter(Boolean);
}

function ReportMetric({ label, value, rank, populationSize, percentile, prominent = false, formatter = formatReportMetric }) {
  const hasPercentile = Number.isFinite(Number(percentile));
  const toneClass = hasPercentile
    ? metricToneClassFromPercentile(percentile)
    : metricToneClass(rank, populationSize);
  const percentileLabel = hasPercentile
    ? formatPercentileValue(percentile)
    : formatPercentile(rank, populationSize);
  return (
    <div className={`${styles.reportMetric} ${prominent ? styles.reportMetricProminent : ""} ${toneClass}`}>
      <span>{label}</span>
      <strong>{formatter(value)}</strong>
      <em>{percentileLabel}</em>
    </div>
  );
}

function ReportChallengeMetric({ label, successes, attempts, rank, populationSize, percentile }) {
  const made = Number(successes) || 0;
  const total = Number(attempts) || 0;
  return (
    <div className={`${styles.reportMetric} ${styles.reportMetricProminent} ${Number.isFinite(Number(percentile)) ? metricToneClassFromPercentile(percentile) : metricToneClass(rank, populationSize)}`}>
      <span>{label}</span>
      <strong>{formatRate(total ? made / total : 0)}</strong>
      <em>{made}/{total} · {Number.isFinite(Number(percentile)) ? formatPercentileValue(percentile) : formatPercentile(rank, populationSize)}</em>
    </div>
  );
}

function OfficialsReportCard({ profile, role, populationSize }) {
  const categories = profile?.callsByCategory || {};
  const shooting = categoryMetric(categories, ["Shooting Foul", "Restricted Area Shooting Foul", "3-Pt Shooting Foul"]);
  const technical = categoryMetric(categories, ["Technical Foul"]);
  const restricted = categoryMetric(categories, ["Restricted Area Shooting Foul"]);
  const threePoint = categoryMetric(categories, ["3-Pt Shooting Foul"]);
  const floor = categoryMetric(categories, ["Foul on Floor", "Away From Play Foul", "Loose Ball Foul", "Double Personal Foul"]);
  const offensive = categoryMetric(categories, ["Offensive Foul"]);
  const handling = categoryMetric(categories, ["Traveling", "Double Dribble", "Palming", "Backcourt", "Offensive Goaltending"]);
  const threeSeconds = categoryMetric(categories, ["Offensive 3 Second Violation", "Defensive 3 Second Violation"]);
  const goaltending = categoryMetric(categories, ["Offensive Goaltending", "Defensive Goaltending"]);
  const wizardsGames = priorWizardsGames(profile?.schedule);

  return (
    <article className={styles.reportOfficialCard}>
      <div className={styles.reportOfficialTop}>
        <div className={styles.reportOfficialIdentity}>
          <RefereeHeadshot name={profile?.name} eager />
          <div>
            <span>{role}</span>
            <h3>{profile?.name || "Official unavailable"}</h3>
            <p>{profile?.jerseyNumber ? `#${profile.jerseyNumber}` : "Number unavailable"}</p>
          </div>
        </div>
        <div className={styles.reportPrimaryMetrics}>
          <ReportChallengeMetric
            label="Challenge (Crew)"
            successes={profile?.successfulCrewChallenges}
            attempts={profile?.crewChallenges}
            rank={profile?.crewChallengeRateRank}
            populationSize={populationSize}
            percentile={profile?.crewChallengeRateRankPercentile}
          />
          <ReportChallengeMetric
            label="Challenge (Crew Chief)"
            successes={profile?.successfulCrewChiefChallenges}
            attempts={profile?.crewChiefChallenges}
            rank={profile?.crewChiefChallengeRateRank}
            populationSize={populationSize}
            percentile={profile?.crewChiefChallengeRateRankPercentile}
          />
          <ReportMetric label="Fouls/G" value={profile?.foulsPerGame} rank={profile?.foulsPerGameRank} populationSize={populationSize} percentile={profile?.foulsPerGameRankPercentile} prominent />
          <ReportMetric
            label="Net Calls For (WAS)"
            value={profile?.wizardsNetCallsFor}
            percentile={profile?.wizardsNetCallsForPercentile}
            prominent
            formatter={formatSignedDecimal}
          />
        </div>
      </div>
      <div className={styles.reportOfficialDetails}>
        <div className={styles.reportStatProfiles}>
          <section>
            <h4>Foul Profile</h4>
            <div className={styles.reportFoulMetrics}>
              <ReportMetric label="Shooting Fouls/G" value={shooting.value} percentile={shooting.percentile} />
              <ReportMetric label="Technical Fouls/G" value={technical.value} percentile={technical.percentile} />
              <ReportMetric label="Restricted Area/G" value={restricted.value} percentile={restricted.percentile} />
              <ReportMetric label="3-PT Fouls/G" value={threePoint.value} percentile={threePoint.percentile} />
              <ReportMetric label="Fouls on Floor/G" value={floor.value} percentile={floor.percentile} />
              <ReportMetric label="Offensive Fouls/G" value={offensive.value} percentile={offensive.percentile} />
            </div>
          </section>
          <section>
            <h4>Violation Profile</h4>
            <div className={styles.reportViolationMetrics}>
              <ReportMetric label="Handling Violations/G" value={handling.value} percentile={handling.percentile} />
              <ReportMetric label="3 Seconds/G" value={threeSeconds.value} percentile={threeSeconds.percentile} />
              <ReportMetric label="Goaltending/G" value={goaltending.value} percentile={goaltending.percentile} />
            </div>
          </section>
        </div>
        <aside className={styles.reportOfficialAside}>
          <section className={styles.reportWizardsHistory}>
            <span>Previous Wizards Games</span>
            {wizardsGames.length ? (
              <ul>{wizardsGames.map((game) => <li key={game}>{game}</li>)}</ul>
            ) : <strong>None in 2025-26</strong>}
          </section>
          <section className={styles.reportWizardsHistory}>
            <span>Trends &amp; Insights</span>
          </section>
        </aside>
      </div>
    </article>
  );
}

function TonightOfficialsReport({ rows, isLoading, onExportPdf, populationSize, gameMetadata }) {
  return (
    <section className={styles.tonightReportPanel}>
      <div className={styles.reportToolbar}>
        <div>
          <h2>Tonight's Officials Report</h2>
          <p>Sample report layout using 2024-Present regular season and playoff stats.</p>
        </div>
        <button type="button" className={styles.primaryButton} onClick={onExportPdf} disabled={isLoading}>
          Export PDF
        </button>
      </div>
      <div className={styles.officialsReportSheet}>
        <header className={styles.officialsReportHeader}>
          <div>
            <span>Washington Wizards</span>
            <h2>{gameMetadata.title}</h2>
          </div>
          <div>
            <strong>{gameMetadata.date}</strong>
          </div>
        </header>
        {isLoading ? (
          <div className={styles.reportLoading}>Loading report data...</div>
        ) : (
          <div className={styles.reportCards}>
            {TONIGHT_REPORT_CREW.map((slot) => {
              const profile = rows.find((row) => String(row?.name || "").toLowerCase() === slot.name.toLowerCase());
              return (
                <OfficialsReportCard
                  key={slot.name}
                  profile={profile || { name: slot.name }}
                  role={slot.role}
                  populationSize={populationSize}
                />
              );
            })}
          </div>
        )}
        <footer className={styles.officialsReportFooter}>
          Stats use 2024-Present regular season + playoffs. Percentiles compare eligible officials in the selected data set.
        </footer>
      </div>
    </section>
  );
}

function buildMetricRankMap(rows, key, eligible = () => true) {
  const rankedRows = rows
    .filter((row) => eligible(row) && Number.isFinite(Number(row[key])))
    .sort((left, right) => Number(right[key] || 0) - Number(left[key] || 0));
  const values = rankedRows.map((row) => Number(row[key]) || 0);
  return {
    total: rankedRows.length,
    ranks: new Map(rankedRows.map((row) => [
      row.id || row.name || row.team,
      values.filter((value) => value > (Number(row[key]) || 0)).length + 1,
    ])),
  };
}

function sortedDisplayRank(rows, sort, row, index) {
  const value = row?.[sort.key];
  const numeric = Number(value);
  const isNumeric = Number.isFinite(numeric) && String(value ?? "").trim() !== "";
  const topIsRankOne = isNumeric ? sort.direction === "desc" : sort.direction === "asc";
  return topIsRankOne ? index + 1 : rows.length - index;
}

function RankedMetric({ value, rankInfo, rowId, formatter = (metric) => formatNumber(metric, 2) }) {
  const rank = rankInfo.ranks.get(rowId);
  return (
    <span className={styles.metricPill} style={rank ? metricToneStyle(rank, rankInfo.total) : undefined}>
      {formatter(value)}
    </span>
  );
}

function ChallengeVisualMetric({ label, successes, attempts, rank, populationSize, percentile }) {
  const total = Number(attempts) || 0;
  const made = Number(successes) || 0;
  const rate = total ? made / total : 0;
  return (
    <div className={styles.challengeMetric}>
      <div>
        <span>{label}</span>
        <strong>{formatRateRecord(made, total)}</strong>
        {Number.isFinite(Number(percentile))
          ? <em>{formatPercentileValue(percentile)}</em>
          : rank ? <em>{formatPercentile(rank, populationSize)}</em> : null}
      </div>
      <div className={styles.challengeTrack} aria-hidden="true">
        <div
          className={rate >= 0.55 ? styles.challengeFillGood : styles.challengeFillBad}
          style={{ width: `${Math.max(4, Math.min(100, rate * 100))}%` }}
        />
      </div>
    </div>
  );
}

function gameDashboardPath(row) {
  const gameId = String(row?.game_id || "").trim();
  if (!gameId) return "";
  const date = String(row?.game_date || "").trim();
  return date ? `/g/${gameId}?d=${encodeURIComponent(date)}` : `/g/${gameId}`;
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
  const metricRanks = useMemo(() => ({
    callsPerGame: buildMetricRankMap(rows, "callsPerGame"),
    foulsPerGame: buildMetricRankMap(rows, "foulsPerGame"),
    violationsPerGame: buildMetricRankMap(rows, "violationsPerGame"),
    whistleChallengeRate: buildMetricRankMap(rows, "whistleChallengeRate", (row) => Number(row.whistleChallenges) >= 5),
    crewChiefChallengeRate: buildMetricRankMap(rows, "crewChiefChallengeRate", (row) => Number(row.crewChiefChallenges) >= 5),
    crewChallengeRate: buildMetricRankMap(rows, "crewChallengeRate", (row) => Number(row.crewChallenges) >= 5),
  }), [rows]);

  if (!rows.length) {
    return (
      <EmptyPanel title="No official profiles yet">
        Deploy the Supabase schema and run the 2025-26 officiating backfill to populate official call profiles.
      </EmptyPanel>
    );
  }

  return (
    <div className={`${styles.tableWrap} ${styles.summaryTableWrap}`}>
      <table className={`${styles.table} ${styles.officialsTable}`}>
        <thead>
          <tr>
            <th>Rank</th>
            <th className={styles.identityHeader}><SortButton label="Official" sortKey="name" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Games" sortKey="games" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Calls/G" sortKey="callsPerGame" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Fouls/G" sortKey="foulsPerGame" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Violations/G" sortKey="violationsPerGame" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Challenges (Whistle)" sortKey="whistleChallengeRate" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Challenges (Crew Chief)" sortKey="crewChiefChallengeRate" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Challenge (Crew)" sortKey="crewChallengeRate" sort={sort} onSort={onSort} /></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className={styles.clickableRow} onClick={() => onSelect(row)}>
              <td>{sortedDisplayRank(rows, sort, row, index)}</td>
              <td className={styles.identityCell}>
                <div className={styles.officialIdentity}>
                  <RefereeHeadshot name={row.name} />
                  {row.jerseyNumber ? <span className={styles.jerseyNumber}>#{row.jerseyNumber}</span> : null}
                  <button type="button" className={styles.nameButton} onClick={(event) => {
                    event.stopPropagation();
                    onSelect(row);
                  }}>
                    {row.name}
                  </button>
                </div>
              </td>
              <td>{row.games}</td>
              <td><RankedMetric value={row.callsPerGame} rowId={row.id} rankInfo={metricRanks.callsPerGame} /></td>
              <td><RankedMetric value={row.foulsPerGame} rowId={row.id} rankInfo={metricRanks.foulsPerGame} /></td>
              <td><RankedMetric value={row.violationsPerGame} rowId={row.id} rankInfo={metricRanks.violationsPerGame} /></td>
              <td><RankedMetric value={row.whistleChallengeRate} rowId={row.id} rankInfo={metricRanks.whistleChallengeRate} formatter={formatRate} /></td>
              <td><RankedMetric value={row.crewChiefChallengeRate} rowId={row.id} rankInfo={metricRanks.crewChiefChallengeRate} formatter={formatRate} /></td>
              <td><RankedMetric value={row.crewChallengeRate} rowId={row.id} rankInfo={metricRanks.crewChallengeRate} formatter={formatRate} /></td>
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
    <div className={`${styles.tableWrap} ${styles.summaryTableWrap}`}>
      <table className={`${styles.table} ${styles.teamsTable}`}>
        <thead>
          <tr>
            <th>Rank</th>
            <th className={styles.identityHeader}><SortButton label="Team" sortKey="team" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Success Rate" sortKey="challengeRate" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Challenges" sortKey="challenges" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Successful" sortKey="successfulChallenges" sort={sort} onSort={onSort} /></th>
            <th><SortButton label="Net Calls For" sortKey="netCallsFor" sort={sort} onSort={onSort} /></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.team} className={styles.clickableRow} onClick={() => onSelect(row)}>
              <td>{sortedDisplayRank(rows, sort, row, index)}</td>
              <td className={styles.identityCell}>
                <div className={styles.teamIdentity}>
                  <TeamLogo team={row.team} teamId={row.teamId} />
                  <button type="button" className={styles.nameButton} onClick={(event) => {
                    event.stopPropagation();
                    onSelect(row);
                  }}>
                    {row.team}
                  </button>
                </div>
              </td>
              <td><span className={styles.successPill} style={successRateStyle(row.challengeRateRank)}>{formatRate(row.challengeRate)}</span></td>
              <td>{row.challenges}</td>
              <td>{row.successfulChallenges}</td>
              <td><span className={`${styles.netPill} ${valueTone(row.netCallsFor)}`}>{formatSignedDecimal(row.netCallsFor)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChallengeFilter({ label, value, options, onChange, allLabel }) {
  return (
    <label className={styles.filterControl}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function contextTagLabels(row) {
  return (row?.context_tags || row?.contextTags || [])
    .map((tag) => String(typeof tag === "string" ? tag : tag?.label || "").trim())
    .filter(Boolean);
}

function contextTagFilterValues(row) {
  return contextTagLabels(row).map(optionValue);
}

function normalizedChallengeClockKey(value) {
  const text = String(value || "").trim();
  const iso = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(text);
  if (iso) return String(Math.round((Number(iso[1] || 0) * 60 + Number(iso[2] || 0)) * 10) / 10);
  const mmss = /^(\d+):(\d+(?:\.\d+)?)$/.exec(text);
  if (mmss) return String(Math.round((Number(mmss[1]) * 60 + Number(mmss[2])) * 10) / 10);
  return text;
}

function challengeContextKey(row) {
  if (!row) return "";
  return [
    row.season || row.seasonYear || "",
    row.game_id || row.gameId || "",
    row.game_date || row.gameDate || "",
    row.away_team || row.awayTeam || "",
    row.home_team || row.homeTeam || "",
    row.challenging_team || row.challengingTeam || "",
    row.period ?? "",
    normalizedChallengeClockKey(row.game_clock || row.gameClock),
  ].map((value) => String(value ?? "").trim()).join("|");
}

function ContextCell({ row, onEditContext }) {
  const labels = contextTagLabels(row);
  return (
    <button type="button" className={styles.contextCellButton} onClick={() => onEditContext?.(row)}>
      {labels.length ? labels.join(", ") : "Add"}
    </button>
  );
}

function ContextTagEditor({ row, options, onClose, onSave, isSaving, error }) {
  const [selected, setSelected] = useState(() => new Set((row?.context_tags || row?.contextTags || []).map((tag) => String(tag.id || "").trim()).filter(Boolean)));
  const [newTag, setNewTag] = useState("");
  const challengeEventId = String(row?.id || "").trim();
  const toggle = (id) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <div className={`${styles.innerModalOverlay} ${styles.contextEditorOverlay}`} role="presentation" onMouseDown={onClose}>
      <section className={`${styles.innerModal} ${styles.contextEditor}`} role="dialog" aria-modal="true" aria-label="Challenge context tags" onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.innerModalHeader}>
          <h3>Challenge Context</h3>
          <button type="button" className={styles.closeButton} onClick={onClose}>Close</button>
        </div>
        <div className={styles.contextEditorMeta}>
          {[row?.game_date, [row?.away_team, row?.home_team].filter(Boolean).join(" @ "), row?.period ? `Q${row.period}` : "", row?.game_clock].filter(Boolean).join(" · ")}
        </div>
        <div className={styles.contextTagGrid}>
          {options.map((tag) => (
            <label key={tag.id} className={styles.contextTagOption}>
              <input type="checkbox" checked={selected.has(tag.id)} onChange={() => toggle(tag.id)} />
              <span>{tag.label}</span>
            </label>
          ))}
        </div>
        <label className={styles.contextNewTag}>
          <span>Create New Tag</span>
          <input value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="Tag name" />
        </label>
        {error ? <p className={styles.contextError}>{error.message || "Unable to save context tags."}</p> : null}
        <div className={styles.contextEditorActions}>
          <button type="button" className={styles.closeButton} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={styles.closeButton}
            disabled={isSaving || !challengeEventId}
            onClick={() => onSave({
              challengeEventId,
              selectedTagIds: [...selected],
              newTagLabels: newTag.trim() ? [newTag.trim()] : [],
            })}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ChallengeLog({ rows, filteredRows, filters, filterOptions, onFilterChange, sort, onSort, onSelectTeam, onSelectOfficial, onEditContext }) {
  if (!rows.length) {
    return (
      <EmptyPanel title="No challenge log yet">
        The league-wide challenge log will populate from NBA challenge review data and matched play-by-play replay events.
      </EmptyPanel>
    );
  }

  return (
    <section className={styles.logPanel}>
      <div className={styles.filterBar}>
        <ChallengeFilter label="Team" value={filters.team} options={filterOptions.teams} allLabel="All teams" onChange={(value) => onFilterChange("team", value)} />
        <ChallengeFilter label="Period" value={filters.period} options={filterOptions.periods} allLabel="All periods" onChange={(value) => onFilterChange("period", value)} />
        <ChallengeFilter label="Type" value={filters.type} options={filterOptions.types} allLabel="All types" onChange={(value) => onFilterChange("type", value)} />
        <ChallengeFilter label="Sub Type" value={filters.subType} options={filterOptions.subTypes} allLabel="All sub types" onChange={(value) => onFilterChange("subType", value)} />
        <ChallengeFilter label="Context" value={filters.context} options={filterOptions.contexts} allLabel="All contexts" onChange={(value) => onFilterChange("context", value)} />
        <ChallengeFilter label="Outcome" value={filters.outcome} options={filterOptions.outcomes} allLabel="All outcomes" onChange={(value) => onFilterChange("outcome", value)} />
        <ChallengeFilter label="Whistle" value={filters.whistle} options={filterOptions.whistles} allLabel="All whistles" onChange={(value) => onFilterChange("whistle", value)} />
        <ChallengeFilter label="Crew Chief" value={filters.crewChief} options={filterOptions.crewChiefs} allLabel="All crew chiefs" onChange={(value) => onFilterChange("crewChief", value)} />
      </div>
      <div className={styles.tableMeta}>
        Showing {filteredRows.length} of {rows.length} challenges
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th><SortButton label="Date" sortKey="game_date" sort={sort} onSort={onSort} /></th>
              <th>Game</th>
              <th><SortButton label="Team" sortKey="challenging_team" sort={sort} onSort={onSort} /></th>
              <th><SortButton label="Period" sortKey="period" sort={sort} onSort={onSort} /></th>
              <th><SortButton label="Clock" sortKey="game_clock" sort={sort} onSort={onSort} /></th>
              <th><SortButton label="Type" sortKey="challenge_type" sort={sort} onSort={onSort} /></th>
              <th><SortButton label="Sub Type" sortKey="challenge_sub_type" sort={sort} onSort={onSort} /></th>
              <th>Context</th>
              <th><SortButton label="Outcome" sortKey="challenge_outcome" sort={sort} onSort={onSort} /></th>
              <th><SortButton label="Whistle" sortKey="whistling_official_name" sort={sort} onSort={onSort} /></th>
              <th><SortButton label="Crew Chief" sortKey="crew_chief_name" sort={sort} onSort={onSort} /></th>
              <th>Video</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, index) => (
              <tr key={row.id || `${row.game_id}-${row.period}-${row.game_clock}-${index}`}>
                <td>{row.game_date || "-"}</td>
                <td>
                  {gameDashboardPath(row) ? (
                    <Link to={gameDashboardPath(row)} className={styles.inlineLink}>
                      {[row.away_team, row.home_team].filter(Boolean).join(" @ ") || row.game_id}
                    </Link>
                  ) : (
                    [row.away_team, row.home_team].filter(Boolean).join(" @ ") || row.game_id || "-"
                  )}
                </td>
                <td>
                  {row.challenging_team ? (
                    <button type="button" className={styles.inlineLink} onClick={() => onSelectTeam(row.challenging_team)}>
                      {row.challenging_team}
                    </button>
                  ) : "-"}
                </td>
                <td>{row.period ? `Q${row.period}` : "-"}</td>
                <td><ChallengeClockLink row={row} /></td>
                <td>{row.challenge_type || "-"}</td>
                <td>{row.challenge_sub_type || "-"}</td>
                <td><ContextCell row={row} onEditContext={onEditContext} /></td>
                <td><OutcomeBadge value={row.challenge_outcome || row.call_ruling} /></td>
                <td>
                  {row.whistling_official_name ? (
                    <button
                      type="button"
                      className={styles.inlineLink}
                      onClick={() => onSelectOfficial(row.whistling_official_name)}
                    >
                      {row.whistling_official_name}
                    </button>
                  ) : "-"}
                </td>
                <td>
                  {row.crew_chief_name ? (
                    <button
                      type="button"
                      className={styles.inlineLink}
                      onClick={() => onSelectOfficial(row.crew_chief_name)}
                    >
                      {row.crew_chief_name}
                    </button>
                  ) : "-"}
                </td>
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
    </section>
  );
}

function MiniChallengeLog({ rows, isLoading = false, officialColumn = "role", onEditContext }) {
  if (!rows?.length) {
    return (
      <p className={styles.detailEmpty}>
        {isLoading ? "Loading challenge rows..." : "No challenge rows in the loaded dataset."}
      </p>
    );
  }
  return (
    <div className={styles.miniTableWrap}>
      <table className={styles.miniTable}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Game</th>
            <th>Period</th>
            <th>Clock</th>
            <th>Type</th>
            <th>Sub Type</th>
            <th>Context</th>
            <th>Outcome</th>
            <th>{officialColumn === "crewChief" ? "Crew Chief" : "Role"}</th>
            <th>Video</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || `${row.game_id}-${row.period}-${row.game_clock}-${index}`}>
              <td>{row.game_date || "-"}</td>
              <td>
                {gameDashboardPath(row) ? (
                  <Link to={gameDashboardPath(row)} className={styles.inlineLink}>
                    {[row.away_team, row.home_team].filter(Boolean).join(" @ ") || row.game_id}
                  </Link>
                ) : (
                  [row.away_team, row.home_team].filter(Boolean).join(" @ ") || row.game_id
                )}
              </td>
              <td>{row.period ? `Q${row.period}` : "-"}</td>
              <td><ChallengeClockLink row={row} /></td>
              <td>{row.challenge_type || "-"}</td>
              <td>{row.challenge_sub_type || "-"}</td>
              <td><ContextCell row={row} onEditContext={onEditContext} /></td>
              <td><OutcomeBadge value={row.challenge_outcome} /></td>
              <td>
                {officialColumn === "crewChief"
                  ? row.crew_chief_name || "-"
                  : row.profileChallengeRole === "crewChief" ? "Crew Chief" : row.profileChallengeRole === "whistle" ? "Whistle" : row.profileChallengeRole === "crew" ? "Crew" : "-"}
              </td>
              <td>{row.video_url ? <a href={row.video_url} target="_blank" rel="noreferrer">Watch</a> : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProfileModal({ children, onClose, label }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className={styles.modalOverlay} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.profileModal}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>,
    document.body
  );
}

function OfficialProfile({ profile, isLoading, loadError, season, onSeasonChange, onClose, onSelectTeam, onEditContext, categoryPopulationSize }) {
  const [detailSectionsOpen, setDetailSectionsOpen] = useState(true);
  if (!profile) return null;
  return (
    <ProfileModal label={`${profile.name} referee profile`} onClose={onClose}>
      <div className={styles.profileHeader}>
        <RefereeHeadshot name={profile.name} />
        <div>
          <div className={styles.kicker}>Referee Profile</div>
          <h2>{profile.name}</h2>
          <p>{profile.jerseyNumber ? `#${profile.jerseyNumber}` : "NBA official"}</p>
        </div>
        <div className={styles.profileHeaderActions}>
          <label className={styles.seasonControl}>
            <span>Season</span>
            <select value={season} onChange={(event) => onSeasonChange(event.target.value)}>
              {SEASON_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <button type="button" className={styles.closeButton} onClick={onClose}>Close</button>
        </div>
      </div>
      <div className={styles.profileMetrics}>
        <ProfileMetric label="Games" value={profile.games} />
        <ProfileMetric
          label="Calls/G"
          value={formatNumber(profile.callsPerGame, 2)}
          detail={Number.isFinite(Number(profile.callsPerGameRankPercentile)) ? formatPercentileValue(profile.callsPerGameRankPercentile) : formatPercentile(profile.callsPerGameRank, categoryPopulationSize)}
          style={profile.callsPerGameRank ? metricToneStyle(profile.callsPerGameRank, categoryPopulationSize) : undefined}
        />
        <ChallengeVisualMetric
          label="Challenges (Whistle)"
          successes={profile.successfulWhistleChallenges}
          attempts={profile.whistleChallenges}
          rank={profile.whistleChallengeRateRank}
          populationSize={categoryPopulationSize}
          percentile={profile.whistleChallengeRateRankPercentile}
        />
        <ChallengeVisualMetric
          label="Challenges (Crew Chief)"
          successes={profile.successfulCrewChiefChallenges}
          attempts={profile.crewChiefChallenges}
          rank={profile.crewChiefChallengeRateRank}
          populationSize={categoryPopulationSize}
          percentile={profile.crewChiefChallengeRateRankPercentile}
        />
        <ChallengeVisualMetric
          label="Challenge (Crew)"
          successes={profile.successfulCrewChallenges}
          attempts={profile.crewChallenges}
          rank={profile.crewChallengeRateRank}
          populationSize={categoryPopulationSize}
          percentile={profile.crewChallengeRateRankPercentile}
        />
      </div>
      {isLoading ? <p className={styles.profileLoading}>Loading profile details...</p> : null}
      {loadError ? <p className={styles.notice}>{loadError}</p> : null}
      <div className={`${styles.detailGrid} ${styles.detailGridCategoryWide}`}>
        <SortableTopList
          title="Calls By Team"
          items={profile.callsByTeam}
          labelHeader="Team"
          valueHeader="Net Calls For"
          onSelectLabel={onSelectTeam}
          valueFormatter={formatSignedDecimal}
          open={detailSectionsOpen}
          onOpenChange={setDetailSectionsOpen}
          isLoading={isLoading}
        />
        <CallsByCategoryBreakdown
          items={profile.callsByCategory}
          isLoading={isLoading}
          open={detailSectionsOpen}
          onOpenChange={setDetailSectionsOpen}
        />
      </div>
      <details className={`${styles.detailBlock} ${styles.scrollBlock}`} open>
        <summary>Challenge Log</summary>
        <MiniChallengeLog rows={profile.challengeLog || []} isLoading={isLoading} onEditContext={onEditContext} />
      </details>
      <details className={`${styles.detailBlock} ${styles.scrollBlock}`} open>
        <summary>Season Schedule</summary>
        <div className={`${styles.splitList} ${styles.scheduleScroll}`}>
          {(profile.schedule || []).map((row) => (
            <div key={`${row.game_id}-${row.official_id}-${row.role_key}`}>
              {gameDashboardPath(row) ? (
                <Link to={gameDashboardPath(row)} className={styles.inlineLink}>
                  {row.game_date} - {[row.away_team, row.home_team].filter(Boolean).join(" @ ")}
                </Link>
              ) : (
                <span>{row.game_date} - {[row.away_team, row.home_team].filter(Boolean).join(" @ ")}</span>
              )}
              <strong>{row.is_alternate || row.role_key === "alternate" || Number(row.assignment_order) >= 4 ? "Alternate" : row.role_key === "crewChief" ? "Crew Chief" : Number(row.assignment_order) === 2 ? "Referee" : Number(row.assignment_order) === 3 ? "Umpire" : "Official"}</strong>
            </div>
          ))}
        </div>
      </details>
    </ProfileModal>
  );
}

function TeamProfile({ profile, isLoading, loadError, season, onSeasonChange, onClose, onSelectOfficial, onEditContext, categoryPopulationSize }) {
  const [detailSectionsOpen, setDetailSectionsOpen] = useState(true);
  if (!profile) return null;
  return (
    <ProfileModal label={`${profile.team} team profile`} onClose={onClose}>
      <div className={styles.profileHeader}>
        <TeamLogo team={profile.team} teamId={profile.teamId} className={styles.profileTeamLogo} />
        <div>
          <div className={styles.kicker}>Team Profile</div>
          <h2>{profile.team}</h2>
          <p>Challenge profile, call trends, and recent event log.</p>
        </div>
        <div className={styles.profileHeaderActions}>
          <label className={styles.seasonControl}>
            <span>Season</span>
            <select value={season} onChange={(event) => onSeasonChange(event.target.value)}>
              {SEASON_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <button type="button" className={styles.closeButton} onClick={onClose}>Close</button>
        </div>
      </div>
      <div className={styles.profileMetrics}>
        <ProfileMetric
          label="Net Calls For"
          value={formatSignedDecimal(profile.netCallsFor)}
          detail={`Rank ${profile.netCallsForRank || "-"}`}
          style={profile.netCallsForRank ? successRateStyle(profile.netCallsForRank) : undefined}
        />
        <ProfileMetric label="Challenges" value={profile.challenges} detail={`Rank ${profile.challengesRank || "-"}`} />
        <ProfileMetric label="Successful" value={profile.successfulChallenges} />
        <ProfileMetric
          label="Success Rate"
          value={formatRate(profile.challengeRate)}
          detail={`Rank ${profile.challengeRateRank || "-"}`}
          style={profile.challengeRateRank ? successRateStyle(profile.challengeRateRank) : undefined}
        />
      </div>
      {isLoading ? <p className={styles.profileLoading}>Loading profile details...</p> : null}
      {loadError ? <p className={styles.notice}>{loadError}</p> : null}
      <div className={`${styles.detailGrid} ${styles.detailGridCategoryWide}`}>
        <SortableTopList
          title="Calls By Official"
          items={profile.callsByOfficial}
          labelHeader="Official"
          valueHeader="Net Calls For"
          onSelectLabel={onSelectOfficial}
          valueFormatter={formatSignedDecimal}
          open={detailSectionsOpen}
          onOpenChange={setDetailSectionsOpen}
          isLoading={isLoading}
        />
        <CallsByCategoryBreakdown
          items={profile.callsByCategory}
          isLoading={isLoading}
          open={detailSectionsOpen}
          onOpenChange={setDetailSectionsOpen}
        />
      </div>
      <details className={styles.detailBlock} open>
        <summary>Challenge Log</summary>
        <MiniChallengeLog rows={profile.challengeLog || []} isLoading={isLoading} officialColumn="crewChief" onEditContext={onEditContext} />
      </details>
    </ProfileModal>
  );
}

async function arrayBufferSha256(arrayBuffer) {
  const digest = await window.crypto.subtle.digest("SHA-256", arrayBuffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function PgrMetricCard({ label, value, detail }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statLabel}>{label}</span>
      <strong className={styles.statValue}>{value}</strong>
      {detail ? <span className={styles.statDetail}>{detail}</span> : null}
    </div>
  );
}

function PgrDistributionTable({ title, rows, mode = "call" }) {
  return (
    <section className={styles.pgrPanel}>
      <div className={styles.pgrPanelHeader}>
        <h2>{title}</h2>
        <span>Evaluation-level</span>
      </div>
      {rows.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Category</th>
                <th>Evaluations</th>
                <th>Events</th>
                <th>{mode === "infraction" ? "Infractions" : "Calls"}</th>
                <th>{mode === "infraction" ? "Infraction Rate" : "Call Rate"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((row) => (
                <tr key={`${row.code}-${row.label}`}>
                  <td>{row.label}</td>
                  <td>{row.evaluations}</td>
                  <td>{row.events}</td>
                  <td>{mode === "infraction" ? row.infractions : row.calls}</td>
                  <td>{formatRate(mode === "infraction" ? row.infractionRate : row.callRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.detailEmpty}>No distribution rows yet.</p>
      )}
    </section>
  );
}

function formatPctNumber(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function pgrAccuracyDetail(bucket) {
  const safe = bucket || {};
  const correct = Number(safe.correctCalls || 0) + Number(safe.correctNonCalls || 0);
  return `${correct}/${Number(safe.total || 0)} correct`;
}

function PgrAccuracyPanel({ title, bucket }) {
  const safe = bucket || {};
  return (
    <section className={styles.pgrPanel}>
      <div className={styles.pgrPanelHeader}>
        <h2>{title}</h2>
        <span>{pgrAccuracyDetail(safe)}</span>
      </div>
      <div className={styles.pgrAccuracyGrid}>
        <PgrMetricCard label="Accuracy" value={formatPctNumber(safe.accuracy)} detail={`${safe.total || 0} evaluations`} />
        <PgrMetricCard label="Bad Calls" value={safe.incorrectCalls || 0} detail={`${safe.calledNoInfraction || 0} no INF, ${safe.calledAssessmentError || 0} assessment`} />
        <PgrMetricCard label="Missed Calls" value={safe.incorrectNonCalls || 0} detail={`${safe.missedInfractions || 0} INF, ${safe.missedPotentialInfractions || 0} potential`} />
      </div>
    </section>
  );
}

function PgrAccuracyTable({ title, rows, emptyText = "No rows available yet." }) {
  return (
    <section className={styles.pgrPanel}>
      <div className={styles.pgrPanelHeader}>
        <h2>{title}</h2>
        <span>{rows.length} groups</span>
      </div>
      {rows.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Group</th>
                <th>Accuracy</th>
                <th>Evals</th>
                <th>Bad Calls</th>
                <th>Missed Calls</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{formatPctNumber(row.accuracy)}</td>
                  <td>{row.total}</td>
                  <td>{row.incorrectCalls}</td>
                  <td>{row.incorrectNonCalls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.detailEmpty}>{emptyText}</p>
      )}
    </section>
  );
}

function buildSmartPgrReportFromSummary(result, filters) {
  const accuracy = result?.accuracy || {};
  const groups = result?.groups || {};
  const topInfractionTypes = (groups.topInfractionTypes || []).slice(0, 5);
  const topOpponents = (groups.topOpponents || []).slice(0, 5);
  const topCrewChiefs = (groups.topCrewChiefs || []).slice(0, 5);
  const topWhistles = (groups.topWhistles || []).slice(0, 5);
  const descriptor = [
    filters.previousGames ? `previous ${filters.previousGames} games` : "",
    filters.startDate || filters.endDate ? `${filters.startDate || "start"} to ${filters.endDate || "present"}` : "",
    filters.opponent ? `vs ${filters.opponent}` : "",
    filters.homeRoad || "",
    filters.crewChief ? `crew chief ${filters.crewChief}` : "",
    filters.whistlingOfficial ? `whistle ${filters.whistlingOfficial}` : "",
  ].filter(Boolean).join(", ") || "all imported Wizards PGR reports";

  const lines = [
    `Scope: ${descriptor}.`,
    `${result.totalFiltered} evaluation rows were included. Overall accuracy was ${formatPctNumber(accuracy.all?.accuracy)} with ${accuracy.all?.incorrectCalls || 0} incorrect calls and ${accuracy.all?.incorrectNonCalls || 0} incorrect non-calls.`,
    `Wizards-favorable review: ${(accuracy.wizardsFor?.incorrectCalls || 0) + (accuracy.wizardsFor?.incorrectNonCalls || 0)} negative accuracy events were tied to plays benefiting Washington; Wizards-against review: ${(accuracy.wizardsAgainst?.incorrectCalls || 0) + (accuracy.wizardsAgainst?.incorrectNonCalls || 0)} negative accuracy events were tied to Washington as the evaluated team.`,
  ];
  if (topInfractionTypes[0]) {
    lines.push(`Most active error category: ${topInfractionTypes[0].label} with ${topInfractionTypes[0].incorrectCalls + topInfractionTypes[0].incorrectNonCalls} negative accuracy events across ${topInfractionTypes[0].total} evaluations.`);
  }
  if (topOpponents[0]) {
    lines.push(`Opponent split to watch: ${topOpponents[0].label} produced ${topOpponents[0].incorrectCalls + topOpponents[0].incorrectNonCalls} negative accuracy events.`);
  }
  if (topCrewChiefs[0]) {
    lines.push(`Crew-chief split: ${topCrewChiefs[0].label} led the filtered set with ${topCrewChiefs[0].total} evaluations and ${formatPctNumber(topCrewChiefs[0].accuracy)} accuracy.`);
  }
  if (topWhistles[0]) {
    lines.push(`Matched whistle split: ${topWhistles[0].label} had ${topWhistles[0].total} matched evaluations and ${formatPctNumber(topWhistles[0].accuracy)} accuracy. This only reflects PGR calls whose EventId matched a stored official-attributed play-by-play event.`);
  }
  return {
    generatedAt: new Date().toLocaleString(),
    totalFiltered: result.totalFiltered,
    accuracy,
    lines,
    tables: {
      topInfractionTypes,
      topOpponents,
      topCrewChiefs,
      topWhistles,
    },
  };
}

function SelectFilter({ label, value, options, onChange }) {
  return (
    <label className={styles.pgrFilterControl}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function PgrSmartInsights({ season, initialOptions = {} }) {
  const [filters, setFilters] = useState({
    previousGames: "",
    startDate: "",
    endDate: "",
    opponent: "",
    homeRoad: "",
    crewChief: "",
    whistlingOfficial: "",
  });
  const [report, setReport] = useState(null);
  const [smartOptions, setSmartOptions] = useState(initialOptions);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState(null);
  const options = smartOptions || initialOptions;
  useEffect(() => {
    setSmartOptions(initialOptions);
  }, [initialOptions]);
  const update = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setReport(null);
  };
  const loadAndReport = async () => {
    setIsFetching(true);
    setError(null);
    try {
      const result = await fetchPgrSmartInsightsReport({ season, filters });
      setSmartOptions(result.filterOptions || initialOptions);
      setReport(buildSmartPgrReportFromSummary(result, filters));
    } catch (nextError) {
      setError(nextError);
    } finally {
      setIsFetching(false);
    }
  };

  return (
    <section className={styles.pgrPanel}>
      <div className={styles.pgrPanelHeader}>
        <h2>Smart Insights</h2>
        <span>{report ? `${report.totalFiltered} filtered evals` : "server-side summary"}</span>
      </div>
      {error ? <div className={styles.notice}>Unable to load Smart Insights: {error.message}</div> : null}
      <div className={styles.pgrFilters}>
        <label className={styles.pgrFilterControl}>
          <span>Previous Games</span>
          <input
            type="number"
            min="1"
            max="82"
            value={filters.previousGames}
            placeholder="All"
            onChange={(event) => update("previousGames", event.target.value)}
          />
        </label>
        <label className={styles.pgrFilterControl}>
          <span>Start Date</span>
          <input type="date" value={filters.startDate} onChange={(event) => update("startDate", event.target.value)} />
        </label>
        <label className={styles.pgrFilterControl}>
          <span>End Date</span>
          <input type="date" value={filters.endDate} onChange={(event) => update("endDate", event.target.value)} />
        </label>
        <SelectFilter label="Opponent" value={filters.opponent} options={options.opponents || []} onChange={(value) => update("opponent", value)} />
        <SelectFilter label="Home / Road" value={filters.homeRoad} options={options.homeRoad || []} onChange={(value) => update("homeRoad", value)} />
        <SelectFilter label="Crew Chief" value={filters.crewChief} options={options.crewChiefs || []} onChange={(value) => update("crewChief", value)} />
        <SelectFilter label="Whistling Official" value={filters.whistlingOfficial} options={options.whistlingOfficials || []} onChange={(value) => update("whistlingOfficial", value)} />
      </div>
      <div className={styles.pgrSmartActions}>
        <button
          type="button"
          className={styles.closeButton}
          disabled={isFetching}
          onClick={loadAndReport}
        >
          {isFetching ? "Loading..." : "Get Smart Insights"}
        </button>
        {report ? (
          <span>
            {formatPctNumber(report.accuracy.all.accuracy)} accuracy, {report.accuracy.all.incorrectCalls} bad calls, {report.accuracy.all.incorrectNonCalls} missed calls
          </span>
        ) : (
          <span>Aggregates load only when requested.</span>
        )}
      </div>
      {report ? (
        <div className={styles.pgrSmartReport}>
          <div>
            <strong>Generated {report.generatedAt}</strong>
            {report.lines.map((line) => <p key={line}>{line}</p>)}
          </div>
          <div className={styles.pgrSmartTables}>
            <PgrAccuracyTable title="Error Types" rows={report.tables.topInfractionTypes} />
            <PgrAccuracyTable title="Opponent Splits" rows={report.tables.topOpponents} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PgrImportsTable({ rows }) {
  return (
    <section className={styles.pgrPanel}>
      <div className={styles.pgrPanelHeader}>
        <h2>Imported Wizards Reports</h2>
        <span>{rows.length} games</span>
      </div>
      {rows.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Game</th>
                <th>File</th>
                <th>Rows</th>
                <th>Events</th>
                <th>Possessions</th>
                <th>INF%</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.gameDate || "-"}</td>
                  <td>
                    <Link to={gameDashboardPath({ game_id: row.gameId, game_date: row.gameDate })} className={styles.inlineLink}>
                      {row.matchup || row.gameId}
                    </Link>
                  </td>
                  <td>{row.filename}</td>
                  <td>{row.rows}</td>
                  <td>{row.events}</td>
                  <td>{row.possessions}</td>
                  <td>{formatRate(row.infractionRate)}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.detailEmpty}>No PGR workbooks imported yet.</p>
      )}
    </section>
  );
}

function PgrUploadPanel({ season, canImport, onImported }) {
  const [uploadRows, setUploadRows] = useState([]);
  const [busy, setBusy] = useState(false);

  const processFiles = async (files) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length || busy) return;
    setBusy(true);
    setUploadRows(selectedFiles.map((file) => ({
      name: file.name,
      status: "queued",
      message: "Waiting to process",
    })));
    let importedAny = false;

    for (const file of selectedFiles) {
      setUploadRows((current) => current.map((row) => (
        row.name === file.name ? { ...row, status: "parsing", message: "Reading workbook" } : row
      )));
      try {
        const arrayBuffer = await file.arrayBuffer();
        const fileHash = await arrayBufferSha256(arrayBuffer);
        const { parsePgrWorkbook, summarizePgrEvaluations } = await import("../pgrWorkbook.js");
        const report = await parsePgrWorkbook(arrayBuffer, { filename: file.name });
        const localSummary = summarizePgrEvaluations(report.evaluations);
        if (report.errors.length) {
          throw new Error(report.errors.join(" "));
        }
        const game = await resolvePgrGameMetadata(report.game_id);
        if (!game?.is_wizards_game) {
          throw new Error(`GameID ${report.game_id || "-"} is not a Washington Wizards game in the existing NBA game source.`);
        }
        setUploadRows((current) => current.map((row) => (
          row.name === file.name
            ? {
              ...row,
              status: "importing",
              message: `${game.matchup || report.game_id}: ${localSummary.evaluations} evals, ${localSummary.events} events`,
            }
            : row
        )));
        const result = await importPgrReport(report, {
          filename: file.name,
          fileHash,
          season,
          game,
        });
        setUploadRows((current) => current.map((row) => (
          row.name === file.name
            ? {
              ...row,
              status: result?.status || "imported",
              message: result?.message || `${game.matchup}: imported ${report.row_count} rows`,
            }
            : row
        )));
        importedAny = true;
      } catch (error) {
        setUploadRows((current) => current.map((row) => (
          row.name === file.name
            ? { ...row, status: "failed", message: error?.message || "Unable to import workbook" }
            : row
        )));
      }
    }
    setBusy(false);
    if (importedAny) onImported?.();
  };

  return (
    <section className={styles.pgrPanel}>
      <div className={styles.pgrPanelHeader}>
        <h2>Import PGR Workbooks</h2>
        <span>Wizards games only</span>
      </div>
      <div className={styles.pgrUploadBox}>
        <label className={`${styles.closeButton} ${!canImport || busy ? styles.disabledButton : ""}`}>
          Select Excel Files
          <input
            type="file"
            accept=".xlsx,.xls"
            multiple
            disabled={!canImport || busy}
            onChange={(event) => {
              processFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <p>
          Files are parsed one at a time, matched by standard NBA GameID, and rejected unless the game is a Wizards game.
        </p>
      </div>
      {!canImport ? (
        <div className={styles.notice}>Admin access is required to import PGR workbooks.</div>
      ) : null}
      {uploadRows.length ? (
        <div className={styles.pgrImportQueue}>
          {uploadRows.map((row) => (
            <div key={row.name}>
              <strong>{row.name}</strong>
              <span>{row.status}</span>
              <p>{row.message}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PgrInsights({ season, canImport }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["pgr-insights", season],
    queryFn: () => fetchPgrInsightsData({ season }),
    staleTime: 60_000,
    retry: 1,
  });

  if (isLoading) {
    return <EmptyPanel title="Loading PGR Insights">Fetching imported Wizards PGR summaries from Supabase.</EmptyPanel>;
  }
  if (error) {
    return <EmptyPanel title="Unable to load PGR Insights">{error.message}</EmptyPanel>;
  }
  const overview = data?.overview || {};
  const accuracy = data?.accuracy || {};

  return (
    <section className={styles.pgrInsights}>
      {data?.unavailable ? (
        <div className={styles.notice}>
          PGR tables are not available yet. Apply `supabase/officiating_intelligence.sql` before importing workbooks.
        </div>
      ) : null}
      {data?.loadWarnings?.length ? (
        <div className={styles.notice}>
          Some PGR summary panels are temporarily unavailable. Imports can continue; refresh after the current upload batch finishes.
        </div>
      ) : null}
      <div className={styles.statsGrid}>
        <PgrMetricCard label="Games" value={overview.games || 0} detail="Wizards reports" />
        <PgrMetricCard label="Evaluations" value={overview.evaluations || 0} detail="Evaluation-level rows" />
        <PgrMetricCard label="Events" value={overview.events || 0} detail="Unique GameID + EventId" />
        <PgrMetricCard label="INF Rate" value={formatRate(overview.infractionRate)} detail={`${overview.infractions || 0} infractions`} />
        <PgrMetricCard label="Call Rate" value={formatRate(overview.callRate)} detail={`${overview.calls || 0} calls`} />
      </div>
      <div className={styles.pgrGrid}>
        <PgrAccuracyPanel title="Overall Accuracy" bucket={accuracy.all} />
        <PgrAccuracyPanel title="Wizards Benefit" bucket={accuracy.wizardsFor} />
        <PgrAccuracyPanel title="Wizards Against" bucket={accuracy.wizardsAgainst} />
      </div>
      <PgrSmartInsights season={season} initialOptions={data?.filterOptions || {}} />
      <PgrUploadPanel season={season} canImport={canImport} onImported={refetch} />
      {data?.assessmentDistribution?.length || data?.infractionDistribution?.length ? (
        <div className={styles.pgrGrid}>
          <PgrDistributionTable title="Assessment Mix" rows={data?.assessmentDistribution || []} />
          <PgrDistributionTable title="Infraction Types" rows={data?.infractionDistribution || []} mode="infraction" />
        </div>
      ) : null}
      <PgrImportsTable rows={data?.imports || []} />
    </section>
  );
}

export default function Officiating() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { accountsEnabled, isAdmin } = useAuth();
  const selectedTab = params.get("tab") || "officials";
  const [officialSort, setOfficialSort] = useState({ key: "games", direction: "desc" });
  const [teamSort, setTeamSort] = useState({ key: "challengeRate", direction: "desc" });
  const [challengeSort, setChallengeSort] = useState({ key: "game_date", direction: "desc" });
  const [challengeFilters, setChallengeFilters] = useState({
    team: "",
    period: "",
    type: "",
    subType: "",
    context: "",
    outcome: "",
    whistle: "",
    crewChief: "",
  });
  const [selectedOfficial, setSelectedOfficial] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedOfficialSeason, setSelectedOfficialSeason] = useState(CUMULATIVE_SEASON);
  const [selectedTeamSeason, setSelectedTeamSeason] = useState(currentOfficiatingSeasonDefault());
  const [loadingOfficialDetails, setLoadingOfficialDetails] = useState(false);
  const [loadingTeamDetails, setLoadingTeamDetails] = useState(false);
  const [officialProfileError, setOfficialProfileError] = useState("");
  const [teamProfileError, setTeamProfileError] = useState("");
  const officialRequestId = useRef(0);
  const teamRequestId = useRef(0);
  const [contextEditorRow, setContextEditorRow] = useState(null);
  const [contextSaveError, setContextSaveError] = useState(null);
  const [isSavingContext, setIsSavingContext] = useState(false);
  const activeTab = TABS.some((tab) => tab.key === selectedTab)
    ? selectedTab
    : "tonight";
  const season = params.get("season") || defaultSeasonForTab(activeTab);
  const reportDate = params.get("d") || formatDateInputInTimeZone(new Date(), "America/New_York");
  const canImportPgr = !accountsEnabled || isAdmin;
  const { data: reportDateGames = [] } = useGamesByDate(reportDate, {
    enabled: activeTab === "tonight",
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const reportGame = reportDateGames.find((game) => (
    String(game?.awayTeam?.teamTricode || "").trim() === "WAS"
    || String(game?.homeTeam?.teamTricode || "").trim() === "WAS"
  ));
  const tonightGameMetadata = reportGameMetadata(reportGame, reportDate);

  const { data, isLoading, error } = useQuery({
    queryKey: ["officiating-dashboard", season],
    queryFn: () => fetchOfficiatingDashboardData({ season }),
    enabled: activeTab !== "tonight",
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
  const {
    data: tonightReportData,
    isLoading: isTonightReportLoading,
  } = useQuery({
    queryKey: ["officiating-tonight-report", CUMULATIVE_SEASON],
    queryFn: () => fetchOfficialsReportData({
      season: CUMULATIVE_SEASON,
      officialNames: TONIGHT_REPORT_CREW.map((slot) => slot.name),
    }),
    enabled: activeTab === "tonight",
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
  const {
    data: selectedOfficialPeerData,
    isLoading: isSelectedOfficialPeerLoading,
  } = useQuery({
    queryKey: ["officiating-dashboard", selectedOfficialSeason, "official-profile-peers"],
    queryFn: () => fetchOfficiatingDashboardData({ season: selectedOfficialSeason }),
    enabled: Boolean(selectedOfficial) && selectedOfficialSeason !== season,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
  const {
    data: selectedTeamPeerData,
    isLoading: isSelectedTeamPeerLoading,
  } = useQuery({
    queryKey: ["officiating-dashboard", selectedTeamSeason, "team-profile-peers"],
    queryFn: () => fetchOfficiatingDashboardData({ season: selectedTeamSeason }),
    enabled: Boolean(selectedTeam) && selectedTeamSeason !== season,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
  const {
    data: loadedChallengeLogRows = [],
    isLoading: isChallengeLogLoading,
    error: challengeLogError,
  } = useQuery({
    queryKey: ["officiating-challenge-log", season],
    queryFn: () => fetchOfficiatingChallengeLog({ season }),
    enabled: activeTab === "challenge-log",
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
  const {
    data: contextTagOptions = [],
  } = useQuery({
    queryKey: ["challenge-context-tags"],
    queryFn: fetchChallengeContextTagOptions,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });

  const visibleTabs = TABS;
  useEffect(() => {
    const handleAfterPrint = () => document.body.classList.remove("officiating-report-print");
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
      document.body.classList.remove("officiating-report-print");
    };
  }, []);
  const sortedOfficials = useMemo(
    () => sortRows(data?.officialProfiles || [], officialSort, "name"),
    [data?.officialProfiles, officialSort]
  );
  const sortedTeams = useMemo(
    () => sortRows(data?.teamProfiles || [], teamSort, "team"),
    [data?.teamProfiles, teamSort]
  );
  const challengeLogRows = activeTab === "challenge-log" ? loadedChallengeLogRows : [];
  const challengeFilterOptions = useMemo(() => {
    const periodOptions = uniqueOptions(challengeLogRows, (row) => row.period)
      .map((period) => ({ value: period, label: `Q${period}` }));
    return {
      teams: uniqueOptions(challengeLogRows, (row) => row.challenging_team)
        .map((value) => ({ value, label: value })),
      periods: periodOptions,
      types: uniqueOptions(challengeLogRows, (row) => row.challenge_type)
        .map((value) => ({ value, label: value })),
      subTypes: uniqueOptions(challengeLogRows, (row) => row.challenge_sub_type)
        .map((value) => ({ value, label: value })),
      contexts: [...new Set(challengeLogRows.flatMap(contextTagFilterValues))]
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
        .map((value) => ({ value, label: value })),
      outcomes: uniqueOptions(challengeLogRows, (row) => row.challenge_outcome || row.call_ruling)
        .map((value) => ({ value, label: value })),
      whistles: uniqueOptions(challengeLogRows, (row) => row.whistling_official_name)
        .map((value) => ({ value, label: value })),
      crewChiefs: uniqueOptions(challengeLogRows, (row) => row.crew_chief_name)
        .map((value) => ({ value, label: value })),
    };
  }, [challengeLogRows]);
  const filteredChallengeRows = useMemo(
    () => challengeLogRows.filter((row) => {
      if (challengeFilters.team && optionValue(row.challenging_team) !== challengeFilters.team) return false;
      if (challengeFilters.period && optionValue(row.period) !== challengeFilters.period) return false;
      if (challengeFilters.type && optionValue(row.challenge_type) !== challengeFilters.type) return false;
      if (challengeFilters.subType && optionValue(row.challenge_sub_type) !== challengeFilters.subType) return false;
      if (challengeFilters.context && !contextTagFilterValues(row).includes(challengeFilters.context)) return false;
      if (challengeFilters.outcome && optionValue(row.challenge_outcome || row.call_ruling) !== challengeFilters.outcome) return false;
      if (challengeFilters.whistle && optionValue(row.whistling_official_name) !== challengeFilters.whistle) return false;
      if (challengeFilters.crewChief && optionValue(row.crew_chief_name) !== challengeFilters.crewChief) return false;
      return true;
    }),
    [challengeLogRows, challengeFilters]
  );
  const sortedChallenges = useMemo(
    () => sortRows(filteredChallengeRows, challengeSort, "game_id"),
    [filteredChallengeRows, challengeSort]
  );
  const officialCategoryPeers = selectedOfficialSeason === season
    ? data?.officialProfiles || []
    : selectedOfficialPeerData?.officialProfiles || [];
  const teamCategoryPeers = selectedTeamSeason === season
    ? data?.teamProfiles || []
    : selectedTeamPeerData?.teamProfiles || [];
  const officialProfilesByName = useMemo(() => {
    const map = new Map();
    (data?.officialProfiles || []).forEach((profile) => {
      map.set(String(profile.name || "").trim().toLowerCase(), profile);
    });
    return map;
  }, [data?.officialProfiles]);
  const teamProfilesByName = useMemo(() => {
    const map = new Map();
    (data?.teamProfiles || []).forEach((profile) => {
      map.set(String(profile.team || "").trim().toLowerCase(), profile);
    });
    return map;
  }, [data?.teamProfiles]);

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
  const setChallengeFilter = (key, value) => {
    setChallengeFilters((current) => ({ ...current, [key]: value }));
  };
  const loadOfficialProfile = async (profile, profileSeason) => {
    if (profile) {
      const requestId = officialRequestId.current + 1;
      officialRequestId.current = requestId;
      setSelectedTeam(null);
      setSelectedOfficial(profile);
      setOfficialProfileError("");
      setLoadingOfficialDetails(true);
      try {
        const details = await fetchOfficialProfileDetails({ season: profileSeason, profile });
        if (officialRequestId.current !== requestId) return;
        setSelectedOfficial((current) => (
          current && String(current.id) === String(profile.id) ? details : current
        ));
      } catch (loadError) {
        if (officialRequestId.current !== requestId) return;
        setOfficialProfileError(loadError instanceof Error ? loadError.message : "Unable to load referee profile details.");
      } finally {
        if (officialRequestId.current === requestId) setLoadingOfficialDetails(false);
      }
    }
  };
  const openOfficialProfile = (profile) => {
    const nextSeason = CUMULATIVE_SEASON;
    setSelectedOfficialSeason(nextSeason);
    loadOfficialProfile(profile, nextSeason);
  };
  const loadTeamProfile = async (profile, profileSeason) => {
    if (profile) {
      const requestId = teamRequestId.current + 1;
      teamRequestId.current = requestId;
      setSelectedOfficial(null);
      setSelectedTeam(profile);
      setTeamProfileError("");
      setLoadingTeamDetails(true);
      try {
        const details = await fetchTeamProfileDetails({ season: profileSeason, profile });
        if (teamRequestId.current !== requestId) return;
        setSelectedTeam((current) => (
          current && String(current.team) === String(profile.team) ? details : current
        ));
      } catch (loadError) {
        if (teamRequestId.current !== requestId) return;
        setTeamProfileError(loadError instanceof Error ? loadError.message : "Unable to load team profile details.");
      } finally {
        if (teamRequestId.current === requestId) setLoadingTeamDetails(false);
      }
    }
  };
  const openTeamProfile = (profile) => {
    const nextSeason = currentOfficiatingSeasonDefault();
    setSelectedTeamSeason(nextSeason);
    loadTeamProfile(profile, nextSeason);
  };
  const changeSelectedOfficialSeason = (nextSeason) => {
    setSelectedOfficialSeason(nextSeason);
    if (selectedOfficial) loadOfficialProfile(selectedOfficial, nextSeason);
  };
  const changeSelectedTeamSeason = (nextSeason) => {
    setSelectedTeamSeason(nextSeason);
    if (selectedTeam) loadTeamProfile(selectedTeam, nextSeason);
  };
  const selectOfficialByName = (name) => {
    const profile = officialProfilesByName.get(String(name || "").trim().toLowerCase());
    openOfficialProfile(profile);
  };
  const selectTeamByName = (team) => {
    const profile = teamProfilesByName.get(String(team || "").trim().toLowerCase());
    openTeamProfile(profile);
  };
  const patchChallengeContextTags = (challengeEventId, selectedTags, editedRow = null, siblingIds = []) => {
    const idsToPatch = new Set([challengeEventId, ...siblingIds].map((id) => String(id || "").trim()).filter(Boolean));
    const editedKey = challengeContextKey(editedRow);
    const shouldPatchRow = (row) => {
      const rowId = String(row?.id || "").trim();
      if (rowId && idsToPatch.has(rowId)) return true;
      return Boolean(editedKey && challengeContextKey(row) === editedKey);
    };
    const patchRows = (rows = []) => rows.map((row) => (
      shouldPatchRow(row)
        ? { ...row, context_tags: selectedTags, contextTags: selectedTags }
        : row
    ));
    setSelectedOfficial((current) => current ? {
      ...current,
      challengeLog: Array.isArray(current.challengeLog) ? patchRows(current.challengeLog) : current.challengeLog,
    } : current);
    setSelectedTeam((current) => current ? {
      ...current,
      challengeLog: Array.isArray(current.challengeLog) ? patchRows(current.challengeLog) : current.challengeLog,
    } : current);
    queryClient.setQueryData(["officiating-challenge-log", season], (currentRows) => (
      Array.isArray(currentRows) ? patchRows(currentRows) : currentRows
    ));
    queryClient.setQueryData(["officiating-dashboard", season], (current) => current ? {
      ...current,
      challengeLog: Array.isArray(current.challengeLog) ? patchRows(current.challengeLog) : current.challengeLog,
      officialProfiles: (current.officialProfiles || []).map((profile) => ({
        ...profile,
        challengeLog: Array.isArray(profile.challengeLog) ? patchRows(profile.challengeLog) : profile.challengeLog,
      })),
      teamProfiles: (current.teamProfiles || []).map((profile) => ({
        ...profile,
        challengeLog: Array.isArray(profile.challengeLog) ? patchRows(profile.challengeLog) : profile.challengeLog,
      })),
    } : current);
    setContextEditorRow((current) => (
      current && shouldPatchRow(current)
        ? { ...current, context_tags: selectedTags, contextTags: selectedTags }
        : current
    ));
  };
  const saveContextTags = async (payload) => {
    setIsSavingContext(true);
    setContextSaveError(null);
    try {
      const editedRow = contextEditorRow;
      const result = await saveChallengeContextTags(payload);
      patchChallengeContextTags(payload.challengeEventId, result.selected, editedRow, result.challengeEventIds);
      queryClient.setQueryData(["challenge-context-tags"], result.options);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["officiating-dashboard", season] }),
        queryClient.invalidateQueries({ queryKey: ["officiating-challenge-log", season] }),
        queryClient.invalidateQueries({ queryKey: ["challenge-context-tags"] }),
      ]);
      setContextEditorRow(null);
    } catch (error) {
      setContextSaveError(error);
    } finally {
      setIsSavingContext(false);
    }
  };
  const exportTonightReportPdf = () => {
    const clearPrintMode = () => document.body.classList.remove("officiating-report-print");
    document.body.classList.add("officiating-report-print");
    window.addEventListener("afterprint", clearPrintMode, { once: true });
    window.setTimeout(() => {
      window.print();
      window.setTimeout(clearPrintMode, 1000);
    }, 60);
  };

  return (
    <div className={styles.page}>
      <section className={styles.header}>
        <div>
          <div className={styles.kicker}>NBA Dashboard</div>
          <h1>Officiating Intelligence</h1>
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
            {SEASON_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
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

      {activeTab !== "tonight" && isLoading ? (
        <EmptyPanel title="Loading officiating data">Fetching cached officiating summaries from Supabase.</EmptyPanel>
      ) : error ? (
        <EmptyPanel title="Unable to load officiating data">{error.message}</EmptyPanel>
      ) : activeTab === "tonight" ? (
        <TonightOfficialsReport
          rows={tonightReportData?.profiles || []}
          isLoading={isTonightReportLoading}
          onExportPdf={exportTonightReportPdf}
          populationSize={tonightReportData?.populationSize || 0}
          gameMetadata={tonightGameMetadata}
        />
      ) : activeTab === "officials" ? (
        <div>
          <OfficialsTable
            rows={sortedOfficials}
            sort={officialSort}
            onSort={toggleSort(setOfficialSort)}
            onSelect={(profile) => {
              openOfficialProfile(profile);
            }}
          />
        </div>
      ) : activeTab === "teams" ? (
        <div>
          <TeamsTable
            rows={sortedTeams}
            sort={teamSort}
            onSort={toggleSort(setTeamSort)}
            onSelect={(profile) => {
              openTeamProfile(profile);
            }}
          />
        </div>
      ) : activeTab === "challenge-log" ? (
        isChallengeLogLoading ? (
          <EmptyPanel title="Loading challenge log">Fetching cached challenge rows from Supabase.</EmptyPanel>
        ) : challengeLogError ? (
          <EmptyPanel title="Unable to load challenge log">{challengeLogError.message}</EmptyPanel>
        ) : (
          <ChallengeLog
            rows={challengeLogRows}
            filteredRows={sortedChallenges}
            filters={challengeFilters}
            filterOptions={challengeFilterOptions}
            onFilterChange={setChallengeFilter}
            sort={challengeSort}
            onSort={toggleSort(setChallengeSort)}
            onSelectTeam={selectTeamByName}
            onSelectOfficial={selectOfficialByName}
            onEditContext={setContextEditorRow}
          />
        )
      ) : activeTab === "pgr-insights" ? (
        <PgrInsights season={season} canImport={canImportPgr} />
      ) : null}
      <OfficialProfile
        profile={selectedOfficial}
        isLoading={loadingOfficialDetails || isSelectedOfficialPeerLoading}
        loadError={officialProfileError}
        season={selectedOfficialSeason}
        onSeasonChange={changeSelectedOfficialSeason}
        onClose={() => setSelectedOfficial(null)}
        onSelectTeam={selectTeamByName}
        onEditContext={setContextEditorRow}
        categoryPopulationSize={officialCategoryPeers.length}
      />
      <TeamProfile
        profile={selectedTeam}
        isLoading={loadingTeamDetails || isSelectedTeamPeerLoading}
        loadError={teamProfileError}
        season={selectedTeamSeason}
        onSeasonChange={changeSelectedTeamSeason}
        onClose={() => setSelectedTeam(null)}
        onSelectOfficial={selectOfficialByName}
        onEditContext={setContextEditorRow}
        categoryPopulationSize={teamCategoryPeers.length}
      />
      {contextEditorRow ? (
        <ContextTagEditor
          row={contextEditorRow}
          options={contextTagOptions}
          onClose={() => {
            setContextSaveError(null);
            setContextEditorRow(null);
          }}
          onSave={saveContextTags}
          isSaving={isSavingContext}
          error={contextSaveError}
        />
      ) : null}
    </div>
  );
}
