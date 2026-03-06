import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGame } from "../api.js";
import { supabase } from "../supabaseClient.js";
import styles from "./Rotations.module.css";

const STORAGE_PREFIX = "rotations:v2:";
const ROTATIONS_ACTION_PAYLOAD = 900000021;
const QUARTERS = [1, 2, 3, 4];
const MINUTES = Array.from({ length: 12 }, (_, index) => 12 - index);
const POSITION_COLUMNS = [1, 2, 3, 4, 5];
const TOTAL_PER_QUARTER = MINUTES.length * POSITION_COLUMNS.length;

const DEFAULT_PLAYERS = [
  { id: "p1", name: "BUB", cap: 48 },
  { id: "p2", name: "BC", cap: 48 },
  { id: "p3", name: "TRE", cap: 48 },
  { id: "p4", name: "KG", cap: 48 },
  { id: "p5", name: "JC", cap: 48 },
  { id: "p6", name: "ALEX", cap: 48 },
  { id: "p7", name: "TV", cap: 48 },
  { id: "p8", name: "SC", cap: 48 },
  { id: "p9", name: "WR", cap: 48 },
  { id: "p10", name: "JW", cap: 48 },
  { id: "p11", name: "AG", cap: 48 },
  { id: "p12", name: "JH", cap: 48 },
  { id: "p13", name: "JR", cap: 48 },
  { id: "p14", name: "LB", cap: 48 },
  { id: "p15", name: "", cap: 48 },
  { id: "p16", name: "", cap: 48 },
  { id: "p17", name: "", cap: 48 },
];

const DEFAULT_DEPTH_ROWS = [
  ["TRAE", "TRE", "BC", "LB", "JR"],
  ["SC", "BUB", "JH", "WR", "AG"],
  ["", "", "", "", ""],
];

const createDefaultQuarterLineups = () => ({
  1: MINUTES.map(() => Array.from({ length: POSITION_COLUMNS.length }, () => "")),
  2: MINUTES.map(() => Array.from({ length: POSITION_COLUMNS.length }, () => "")),
  3: MINUTES.map(() => Array.from({ length: POSITION_COLUMNS.length }, () => "")),
  4: MINUTES.map(() => Array.from({ length: POSITION_COLUMNS.length }, () => "")),
});

const createDefaultDepthChart = () => DEFAULT_DEPTH_ROWS.map((row) => row.slice());

const createDefaultState = () => ({
  players: DEFAULT_PLAYERS,
  depthChart: createDefaultDepthChart(),
  lineups: createDefaultQuarterLineups(),
});

function safeParseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizePlayers(rawPlayers) {
  const normalized = (Array.isArray(rawPlayers) ? rawPlayers : []).slice(0, 17).map((player, index) => ({
    id: String(player?.id || `p${index + 1}`),
    name: normalizeName(player?.name),
    cap: Number.isFinite(Number(player?.cap)) ? Number(player.cap) : 48,
  }));
  while (normalized.length < 17) {
    normalized.push({ id: `p${normalized.length + 1}`, name: "", cap: 48 });
  }
  return normalized;
}

function normalizeDepthChart(rawDepth) {
  const fallback = createDefaultDepthChart();
  if (Array.isArray(rawDepth)) {
    const normalizedRows = [0, 1, 2].map((rowIndex) => {
      const row = Array.isArray(rawDepth[rowIndex]) ? rawDepth[rowIndex] : [];
      return POSITION_COLUMNS.map((_, columnIndex) => normalizeName(row[columnIndex] || ""));
    });
    return normalizedRows;
  }

  // Backward compatibility with previous shape keyed by quarter.
  if (rawDepth && typeof rawDepth === "object") {
    const quarterOneRows = Array.isArray(rawDepth[1]) ? rawDepth[1] : fallback;
    return [0, 1, 2].map((rowIndex) => {
      const row = Array.isArray(quarterOneRows[rowIndex]) ? quarterOneRows[rowIndex] : [];
      return POSITION_COLUMNS.map((_, columnIndex) => normalizeName(row[columnIndex] || ""));
    });
  }

  return fallback;
}

function normalizeLineups(rawLineups) {
  const fallback = createDefaultQuarterLineups();
  const result = {};
  QUARTERS.forEach((quarter) => {
    const rows = Array.isArray(rawLineups?.[quarter]) ? rawLineups[quarter] : fallback[quarter];
    result[quarter] = MINUTES.map((_, minuteIndex) => {
      const row = Array.isArray(rows?.[minuteIndex]) ? rows[minuteIndex] : [];
      return POSITION_COLUMNS.map((_, columnIndex) => normalizeName(row[columnIndex] || ""));
    });
  });
  return result;
}

function normalizeState(rawState) {
  if (!rawState || typeof rawState !== "object") return createDefaultState();
  return {
    players: normalizePlayers(rawState.players),
    depthChart: normalizeDepthChart(rawState.depthChart),
    lineups: normalizeLineups(rawState.lineups),
  };
}

function localStorageKey(gameId) {
  return `${STORAGE_PREFIX}${gameId}`;
}

function loadLocalPayload(gameId) {
  if (typeof window === "undefined" || !gameId) return null;
  const raw = window.localStorage.getItem(localStorageKey(gameId));
  if (!raw) return null;
  const parsed = safeParseJson(raw, null);
  if (!parsed || typeof parsed !== "object") return null;
  return {
    updatedAt: Number(parsed.updatedAt || 0),
    state: normalizeState(parsed.state || parsed),
  };
}

function persistLocalPayload(gameId, state, updatedAt = Date.now()) {
  if (typeof window === "undefined" || !gameId) return;
  window.localStorage.setItem(localStorageKey(gameId), JSON.stringify({
    updatedAt,
    state,
  }));
}

function parseRemotePayload(note) {
  const parsed = safeParseJson(note || "{}", null);
  if (!parsed || typeof parsed !== "object") return { updatedAt: 0, state: null };
  const updatedAt = Number(parsed.updatedAt || 0);
  const state = parsed.state || parsed;
  return {
    updatedAt,
    state: normalizeState(state),
  };
}

async function fetchRemoteState(gameId) {
  if (!supabase || !gameId) return null;
  const { data, error } = await supabase
    .from("pbp_highlights")
    .select("note")
    .eq("game_id", String(gameId))
    .eq("action_number", ROTATIONS_ACTION_PAYLOAD)
    .maybeSingle();
  if (error) return null;
  return parseRemotePayload(data?.note);
}

async function saveRemoteState(gameId, state, updatedAt = Date.now()) {
  if (!supabase || !gameId) return;
  await supabase.from("pbp_highlights").upsert(
    {
      game_id: String(gameId),
      action_number: ROTATIONS_ACTION_PAYLOAD,
      note: JSON.stringify({
        updatedAt,
        state,
      }),
    },
    { onConflict: "game_id,action_number" }
  );
}

function isWashingtonTeam(team) {
  const tricode = String(team?.teamTricode || "").toUpperCase();
  const name = `${team?.teamCity || ""} ${team?.teamName || ""}`.toLowerCase();
  return tricode === "WAS" || name.includes("washington") || name.includes("wizards");
}

function buildOpponentLabel(game) {
  const away = game?.awayTeam;
  const home = game?.homeTeam;
  const washingtonAway = isWashingtonTeam(away);
  const opponent = washingtonAway ? home : away;
  if (!opponent) return "WASHINGTON ROTATION PLAN";
  const city = String(opponent.teamCity || "").trim();
  const teamName = String(opponent.teamName || "").trim();
  if (washingtonAway) return `@ ${city} ${teamName}`.trim().toUpperCase();
  return `vs ${city} ${teamName}`.trim().toUpperCase();
}

function quarterLabel(quarter) {
  if (quarter === 1) return "1st";
  if (quarter === 2) return "2nd";
  if (quarter === 3) return "3rd";
  return "4th";
}

export default function Rotations() {
  const { gameId } = useParams();
  const [params] = useSearchParams();
  const dateParam = params.get("d");
  const backUrl = dateParam ? `/g/${gameId}?d=${dateParam}` : `/g/${gameId}`;
  const [players, setPlayers] = useState(DEFAULT_PLAYERS);
  const [depthChart, setDepthChart] = useState(createDefaultDepthChart());
  const [lineups, setLineups] = useState(createDefaultQuarterLineups());
  const [hydrated, setHydrated] = useState(false);
  const [collapsed, setCollapsed] = useState({
    restrictions: false,
    depth: false,
    q1: false,
    q2: false,
    q3: false,
    q4: false,
  });
  const updatedAtRef = useRef(0);
  const skipSaveRef = useRef(false);

  const { data: game, isLoading, error } = useQuery({
    queryKey: ["game-rotations", gameId],
    queryFn: () => fetchGame(gameId),
    enabled: Boolean(gameId),
  });

  const { data: remoteState, isFetched: remoteStateFetched } = useQuery({
    queryKey: ["rotations-remote", gameId],
    queryFn: () => fetchRemoteState(gameId),
    enabled: Boolean(supabase && gameId),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });

  const washingtonGame = useMemo(() => (
    isWashingtonTeam(game?.homeTeam) || isWashingtonTeam(game?.awayTeam)
  ), [game]);

  useEffect(() => {
    setHydrated(false);
    updatedAtRef.current = 0;
    skipSaveRef.current = false;
  }, [gameId]);

  useEffect(() => {
    if (hydrated || !gameId) return;
    if (supabase && !remoteStateFetched) return;

    const defaults = createDefaultState();
    const localPayload = loadLocalPayload(gameId);
    const localUpdatedAt = Number(localPayload?.updatedAt || 0);
    const remoteUpdatedAt = Number(remoteState?.updatedAt || 0);

    let selected = defaults;
    let selectedUpdatedAt = 0;

    if (remoteState?.state && remoteUpdatedAt >= localUpdatedAt) {
      selected = remoteState.state;
      selectedUpdatedAt = remoteUpdatedAt;
    } else if (localPayload?.state) {
      selected = localPayload.state;
      selectedUpdatedAt = localUpdatedAt;
    }

    setPlayers(selected.players);
    setDepthChart(selected.depthChart);
    setLineups(selected.lineups);
    updatedAtRef.current = selectedUpdatedAt;
    skipSaveRef.current = true;
    setHydrated(true);
  }, [gameId, hydrated, remoteState, remoteStateFetched]);

  useEffect(() => {
    if (!hydrated || !gameId) return;
    const state = { players, depthChart, lineups };

    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      persistLocalPayload(gameId, state, updatedAtRef.current || Date.now());
      return;
    }

    const updatedAt = Date.now();
    updatedAtRef.current = updatedAt;
    persistLocalPayload(gameId, state, updatedAt);
    saveRemoteState(gameId, state, updatedAt);
  }, [gameId, hydrated, players, depthChart, lineups]);

  useEffect(() => {
    if (!hydrated || !gameId || !remoteState?.state) return;
    const remoteUpdatedAt = Number(remoteState.updatedAt || 0);
    if (!remoteUpdatedAt || remoteUpdatedAt <= updatedAtRef.current) return;
    setPlayers(remoteState.state.players);
    setDepthChart(remoteState.state.depthChart);
    setLineups(remoteState.state.lineups);
    updatedAtRef.current = remoteUpdatedAt;
    skipSaveRef.current = true;
    persistLocalPayload(gameId, remoteState.state, remoteUpdatedAt);
  }, [gameId, hydrated, remoteState]);

  const playerOptions = useMemo(() => {
    const unique = new Set();
    players.forEach((player) => {
      const name = normalizeName(player.name);
      if (!name) return;
      unique.add(name);
    });
    return Array.from(unique);
  }, [players]);

  const quarterCounts = useMemo(() => {
    const result = { 1: {}, 2: {}, 3: {}, 4: {} };
    QUARTERS.forEach((quarter) => {
      const counts = {};
      (lineups[quarter] || []).forEach((row) => {
        row.forEach((value) => {
          const name = normalizeName(value);
          if (!name) return;
          counts[name] = (counts[name] || 0) + 1;
        });
      });
      result[quarter] = counts;
    });
    return result;
  }, [lineups]);

  const totalCounts = useMemo(() => {
    const totals = {};
    QUARTERS.forEach((quarter) => {
      Object.entries(quarterCounts[quarter] || {}).forEach(([name, count]) => {
        totals[name] = (totals[name] || 0) + (count || 0);
      });
    });
    return totals;
  }, [quarterCounts]);

  const quarterTotals = useMemo(() => {
    const values = { 1: 0, 2: 0, 3: 0, 4: 0 };
    QUARTERS.forEach((quarter) => {
      let filled = 0;
      (lineups[quarter] || []).forEach((row) => {
        row.forEach((value) => {
          if (normalizeName(value)) filled += 1;
        });
      });
      values[quarter] = filled;
    });
    return values;
  }, [lineups]);

  const allQuarterTotal = quarterTotals[1] + quarterTotals[2] + quarterTotals[3] + quarterTotals[4];
  const opponentLabel = useMemo(() => buildOpponentLabel(game), [game]);
  const teamHeader = String(game?.homeTeam?.teamName && game?.awayTeam?.teamName
    ? (isWashingtonTeam(game.awayTeam) ? game.homeTeam.teamName : game.awayTeam.teamName)
    : "OPPONENT").toUpperCase();

  const updatePlayerField = (playerId, field, value) => {
    setPlayers((current) => current.map((player) => {
      if (player.id !== playerId) return player;
      if (field === "cap") {
        const parsed = Number.parseInt(value, 10);
        return { ...player, cap: Number.isFinite(parsed) ? parsed : 0 };
      }
      return { ...player, [field]: normalizeName(value) };
    }));
  };

  const updateDepthCell = (rowIndex, columnIndex, value) => {
    setDepthChart((current) => current.map((row, rIndex) => (
      rIndex !== rowIndex ? row : row.map((cell, cIndex) => (cIndex === columnIndex ? normalizeName(value) : cell))
    )));
  };

  const updateLineupCell = (quarter, minuteIndex, positionIndex, value) => {
    setLineups((current) => ({
      ...current,
      [quarter]: current[quarter].map((row, rIndex) => (
        rIndex !== minuteIndex
          ? row
          : row.map((cell, cIndex) => (cIndex === positionIndex ? normalizeName(value) : cell))
      )),
    }));
  };

  const resetAll = () => {
    const next = createDefaultState();
    setPlayers(next.players);
    setDepthChart(next.depthChart);
    setLineups(next.lineups);
  };

  const toggleSection = (key) => {
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));
  };

  const getRowValues = (quarter, minuteIndex) => (lineups[quarter]?.[minuteIndex] || []);

  const getPreviousRowValues = (quarter, minuteIndex) => {
    if (minuteIndex > 0) return getRowValues(quarter, minuteIndex - 1);
    if (quarter > 1) return getRowValues(quarter - 1, MINUTES.length - 1);
    return null;
  };

  const getNextRowValues = (quarter, minuteIndex) => {
    if (minuteIndex < MINUTES.length - 1) return getRowValues(quarter, minuteIndex + 1);
    if (quarter < 4) return getRowValues(quarter + 1, 0);
    return null;
  };

  if (isLoading) {
    return <div className={styles.stateMessage}>Loading rotations...</div>;
  }

  if (error || !game) {
    return <div className={styles.stateMessage}>Unable to load rotations.</div>;
  }

  if (!washingtonGame) {
    return (
      <div className={styles.page}>
        <div className={styles.topRow}>
          <Link className={styles.backButton} to={backUrl}>Back</Link>
        </div>
        <div className={styles.stateMessage}>Rotations is available only for Washington games.</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <Link className={styles.backButton} to={backUrl}>Back</Link>
        <button type="button" className={styles.secondaryButton} onClick={resetAll}>Reset</button>
      </div>

      <header className={styles.header}>
        <h1 className={styles.title}>{teamHeader}</h1>
        <p className={styles.subtitle}>{opponentLabel}</p>
      </header>

      <section className={styles.sheetSection}>
        <button type="button" className={styles.sectionHeaderButton} onClick={() => toggleSection("restrictions")}>
          Restrictions / Totals
        </button>
        {!collapsed.restrictions && (
          <table className={styles.totalsTable}>
            <thead>
              <tr>
                <th>Player</th>
                <th>Cap</th>
                <th>1st</th>
                <th>2nd</th>
                <th>3rd</th>
                <th>4th</th>
                <th>Tot</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const name = normalizeName(player.name);
                const cap = Number(player.cap) || 0;
                const q1 = name ? (quarterCounts[1]?.[name] || 0) : 0;
                const q2 = name ? (quarterCounts[2]?.[name] || 0) : 0;
                const q3 = name ? (quarterCounts[3]?.[name] || 0) : 0;
                const q4 = name ? (quarterCounts[4]?.[name] || 0) : 0;
                const totalCount = name ? (totalCounts[name] || 0) : 0;
                let totalClassName = "";
                if (name && totalCount > cap) totalClassName = styles.overCapCell;
                else if (name && totalCount >= Math.max(0, cap - 5)) totalClassName = styles.nearCapCell;

                return (
                  <tr key={`totals-row-${player.id}`}>
                    <td className={styles.playerNameCell}>
                      <input
                        className={styles.playerNameInput}
                        value={player.name}
                        onChange={(event) => updatePlayerField(player.id, "name", event.target.value)}
                        aria-label={`Player ${player.id}`}
                      />
                    </td>
                    <td>
                      <input
                        className={styles.capInput}
                        type="number"
                        min="0"
                        value={cap}
                        onChange={(event) => updatePlayerField(player.id, "cap", event.target.value)}
                        aria-label={`Cap for ${name || player.id}`}
                      />
                    </td>
                    <td>{q1}</td>
                    <td>{q2}</td>
                    <td>{q3}</td>
                    <td>{q4}</td>
                    <td className={totalClassName}>{totalCount}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td />
                <td className={quarterTotals[1] !== TOTAL_PER_QUARTER ? styles.badTotalCell : ""}>{quarterTotals[1]}</td>
                <td className={quarterTotals[2] !== TOTAL_PER_QUARTER ? styles.badTotalCell : ""}>{quarterTotals[2]}</td>
                <td className={quarterTotals[3] !== TOTAL_PER_QUARTER ? styles.badTotalCell : ""}>{quarterTotals[3]}</td>
                <td className={quarterTotals[4] !== TOTAL_PER_QUARTER ? styles.badTotalCell : ""}>{quarterTotals[4]}</td>
                <td className={allQuarterTotal !== TOTAL_PER_QUARTER * 4 ? styles.badTotalCell : ""}>{allQuarterTotal}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <section className={styles.sheetSection}>
        <button type="button" className={styles.sectionHeaderButton} onClick={() => toggleSection("depth")}>
          Depth Chart
        </button>
        {!collapsed.depth && (
          <table className={styles.depthTable}>
            <thead>
              <tr>
                {POSITION_COLUMNS.map((position) => <th key={`depth-head-${position}`}>{position}</th>)}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((rowIndex) => (
                <tr key={`depth-row-${rowIndex}`}>
                  {POSITION_COLUMNS.map((position) => {
                    const columnIndex = position - 1;
                    const value = depthChart[rowIndex]?.[columnIndex] || "";
                    return (
                      <td key={`depth-cell-${rowIndex}-${position}`}>
                        <select
                          className={styles.playerSelect}
                          value={value}
                          onChange={(event) => updateDepthCell(rowIndex, columnIndex, event.target.value)}
                        >
                          <option value=""> </option>
                          {playerOptions.map((option) => (
                            <option key={`depth-${rowIndex}-${position}-${option}`} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {QUARTERS.map((quarter) => {
        const sectionKey = `q${quarter}`;
        return (
          <section key={quarter} className={styles.sheetSection}>
            <button type="button" className={styles.sectionHeaderButton} onClick={() => toggleSection(sectionKey)}>
              {quarterLabel(quarter)} Quarter
            </button>
            {!collapsed[sectionKey] && (
              <table className={styles.rotationTable}>
                <thead>
                  <tr>
                    <th>Time</th>
                    {POSITION_COLUMNS.map((position) => <th key={`pos-${quarter}-${position}`}>{position}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MINUTES.map((minute, minuteIndex) => {
                    const rowValues = lineups[quarter]?.[minuteIndex] || [];
                    const nonBlank = rowValues.filter((value) => normalizeName(value));
                    const hasDuplicate = new Set(nonBlank).size !== nonBlank.length;
                    const previousRowValues = getPreviousRowValues(quarter, minuteIndex);
                    const nextRowValues = getNextRowValues(quarter, minuteIndex);

                    return (
                      <tr key={`minute-row-${quarter}-${minute}`}>
                        <td className={styles.minuteCell}>{minute}</td>
                        {POSITION_COLUMNS.map((position) => {
                          const positionIndex = position - 1;
                          const value = rowValues[positionIndex] || "";
                          const normalizedValue = normalizeName(value);
                          const isSubIn = Boolean(
                            normalizedValue
                              && previousRowValues
                              && !previousRowValues.some((entry) => normalizeName(entry) === normalizedValue)
                          );
                          const isSubOut = Boolean(
                            normalizedValue
                              && nextRowValues
                              && !nextRowValues.some((entry) => normalizeName(entry) === normalizedValue)
                          );

                          const cellClassName = [
                            hasDuplicate && value ? styles.duplicateCell : "",
                            isSubOut ? styles.subOutCell : "",
                            isSubIn ? styles.subInCell : "",
                          ].filter(Boolean).join(" ");

                          return (
                            <td key={`lineup-cell-${quarter}-${minute}-${position}`} className={cellClassName}>
                              <select
                                className={styles.playerSelect}
                                value={value}
                                onChange={(event) => updateLineupCell(quarter, minuteIndex, positionIndex, event.target.value)}
                              >
                                <option value=""> </option>
                                {playerOptions.map((option) => (
                                  <option key={`${quarter}-${minute}-${position}-${option}`} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </div>
  );
}
