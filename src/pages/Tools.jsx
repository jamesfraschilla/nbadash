import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchCurrentGLeagueRosters, fetchCurrentNbaRosters, teamLogoUrl } from "../api.js";
import { useAuth } from "../auth/useAuth.js";
import {
  GLEAGUE_TEAMS,
  getLeagueTeam,
  getNbaTeamRoster,
  NBA_TEAMS,
} from "../data/nbaTeams.js";
import {
  deleteSavedToolRecord,
  deleteSavedToolRecordRemote,
  getSavedToolRecord,
  getSavedToolRecordRemote,
  saveToolRecord,
  saveToolRecordRemote,
  TOOL_RECORD_TYPES,
} from "../toolVault.js";
import {
  buildLateGameStrategyState,
  evaluateLateGameStrategy,
} from "../lateGameStrategy.js";
import { requestPregameScoutingPacket } from "../pregameScoutingData.js";
import LateGameMatrixPanel from "../components/LateGameMatrixPanel.jsx";
import {
  buildMarginRange,
  buildDefaultStrategyOverrides,
  buildStrategyOverrideDraft,
  getMarginOptionLabel,
} from "../components/lateGamePanelHelpers.js";
import { exportMatchupGraphic } from "./matchupGraphicExport.js";
import styles from "./Tools.module.css";

const EMPTY_PLAYER_IDS = Array(5).fill("");
const WIZARDS_TEAM_ID = "1610612764";
const CAPITAL_CITY_TEAM_ID = "1612709928";
const TOOL_TABS = {
  MATCHUP: "matchup",
  SCOUTING: "scouting",
  LATE_GAME: "late-game",
};
const PREVIOUS_GAME_OPTIONS = Array.from({ length: 20 }, (_, index) => index + 1);

function buildEmptyDraft() {
  return {
    league: "nba",
    leftTeamId: "",
    rightTeamId: "",
    leftPlayerIds: [...EMPTY_PLAYER_IDS],
    rightPlayerIds: [...EMPTY_PLAYER_IDS],
    logoTeamId: "",
  };
}

function normalizeTeamScopes(teamScopes) {
  return new Set(
    (Array.isArray(teamScopes) ? teamScopes : [])
      .map((value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "_"))
      .filter(Boolean)
  );
}

function buildDefaultDraftForLeague(league, teamScopes) {
  const normalizedLeague = league === "gleague" ? "gleague" : "nba";
  const scopes = normalizeTeamScopes(teamScopes);
  const nextDraft = {
    ...buildEmptyDraft(),
    league: normalizedLeague,
  };

  if (normalizedLeague === "nba" && scopes.has("washington")) {
    nextDraft.leftTeamId = WIZARDS_TEAM_ID;
    nextDraft.logoTeamId = WIZARDS_TEAM_ID;
  }

  if (normalizedLeague === "gleague" && scopes.has("capital_city")) {
    nextDraft.leftTeamId = CAPITAL_CITY_TEAM_ID;
    nextDraft.logoTeamId = CAPITAL_CITY_TEAM_ID;
  }

  return nextDraft;
}

function buildDefaultDraftForProfile(profile) {
  const scopes = normalizeTeamScopes(profile?.team_scopes);
  if (scopes.has("washington")) {
    return buildDefaultDraftForLeague("nba", scopes);
  }
  if (scopes.has("capital_city")) {
    return buildDefaultDraftForLeague("gleague", scopes);
  }
  return buildEmptyDraft();
}

function buildDefaultScoutingDraftForProfile(profile) {
  const scopes = normalizeTeamScopes(profile?.team_scopes);
  const league = scopes.has("capital_city") && !scopes.has("washington") ? "gleague" : "nba";
  return {
    league,
    teamId: "",
    rangeMode: "games",
    previousGames: "5",
    startDate: "",
    endDate: "",
  };
}

function hydrateScoutingPayload(payload, fallbackDraft) {
  const draftSource = payload?.scoutingDraft && typeof payload.scoutingDraft === "object"
    ? payload.scoutingDraft
    : payload;
  return {
    league: String(draftSource?.league || fallbackDraft?.league || "nba").trim() === "gleague" ? "gleague" : "nba",
    teamId: String(draftSource?.teamId || "").trim(),
    rangeMode: String(draftSource?.rangeMode || fallbackDraft?.rangeMode || "games").trim() === "dates" ? "dates" : "games",
    previousGames: String(draftSource?.previousGames || fallbackDraft?.previousGames || "5").trim() || "5",
    startDate: String(draftSource?.startDate || "").trim(),
    endDate: String(draftSource?.endDate || "").trim(),
  };
}

function buildScoutingRangeLabel(draft) {
  const mode = String(draft?.rangeMode || "games").trim() === "dates" ? "dates" : "games";
  if (mode === "dates") {
    const startDate = String(draft?.startDate || "").trim();
    const endDate = String(draft?.endDate || "").trim();
    if (startDate && endDate) return `${startDate} to ${endDate}`;
    return "Custom Date Range";
  }
  const previousGames = Math.min(20, Math.max(1, Number.parseInt(String(draft?.previousGames || "5"), 10) || 5));
  return `Previous ${previousGames} Game${previousGames === 1 ? "" : "s"}`;
}

function buildScoutingRecordTitle(draft) {
  const league = String(draft?.league || "nba").trim() === "gleague" ? "gleague" : "nba";
  const team = getLeagueTeam(draft?.teamId, league);
  const teamLabel = team?.fullName || "Team";
  return `${teamLabel} Scouting Packet · ${buildScoutingRangeLabel(draft)}`;
}

function buildLateGameToolSetup(profile) {
  const scopes = normalizeTeamScopes(profile?.team_scopes);
  if (scopes.has("washington")) {
    return { league: "nba", awayTeamId: WIZARDS_TEAM_ID, homeTeamId: "" };
  }
  if (scopes.has("capital_city")) {
    return { league: "gleague", awayTeamId: CAPITAL_CITY_TEAM_ID, homeTeamId: "" };
  }
  return { league: "nba", awayTeamId: "", homeTeamId: "" };
}

function isDraftBlank(draft) {
  if (!draft || typeof draft !== "object") return true;
  const leftPlayerIds = Array.isArray(draft.leftPlayerIds) ? draft.leftPlayerIds : [];
  const rightPlayerIds = Array.isArray(draft.rightPlayerIds) ? draft.rightPlayerIds : [];
  return !String(draft.leftTeamId || "").trim() &&
    !String(draft.rightTeamId || "").trim() &&
    !String(draft.logoTeamId || "").trim() &&
    !leftPlayerIds.some((value) => String(value || "").trim()) &&
    !rightPlayerIds.some((value) => String(value || "").trim());
}

function hydrateDraftPayload(payload, fallbackDraft) {
  const normalizedLeague = String(payload?.league || fallbackDraft?.league || "nba").trim() === "gleague" ? "gleague" : "nba";
  return {
    league: normalizedLeague,
    leftTeamId: String(payload?.leftTeamId || "").trim() || String(fallbackDraft?.leftTeamId || "").trim(),
    rightTeamId: String(payload?.rightTeamId || "").trim(),
    leftPlayerIds: [...EMPTY_PLAYER_IDS].map((_, index) => String(payload?.leftPlayerIds?.[index] || "").trim()),
    rightPlayerIds: [...EMPTY_PLAYER_IDS].map((_, index) => String(payload?.rightPlayerIds?.[index] || "").trim()),
    logoTeamId: String(payload?.logoTeamId || "").trim() || String(fallbackDraft?.logoTeamId || "").trim(),
  };
}

function teamDisplayCode(team) {
  const explicitCode = String(team?.tricode || team?.teamAbbreviation || "").trim();
  if (explicitCode) return explicitCode.toUpperCase();
  return String(team?.fullName || "Match-Up")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function buildDraftTitle(draft) {
  const league = String(draft?.league || "nba").trim() === "gleague" ? "gleague" : "nba";
  const leftTeam = getLeagueTeam(draft?.leftTeamId, league);
  const rightTeam = getLeagueTeam(draft?.rightTeamId, league);
  if (leftTeam && rightTeam) {
    return `${teamDisplayCode(leftTeam)} vs ${teamDisplayCode(rightTeam)} Match-Up`;
  }
  if (leftTeam || rightTeam) {
    return `${teamDisplayCode(leftTeam || rightTeam) || (league === "gleague" ? "G League" : "NBA")} Match-Up`;
  }
  return league === "gleague" ? "G League Match-Up Draft" : "NBA Match-Up Draft";
}

function formatPlayerOption(player) {
  return `#${player.jerseyNum || "--"} ${player.fullName}`.trim();
}

function resolveSelectedPlayers(playerIds, roster) {
  const playersById = new Map((roster || []).map((player) => [player.personId, player]));
  return [...EMPTY_PLAYER_IDS].map((_, index) => {
    const playerId = String(playerIds?.[index] || "").trim();
    return playersById.get(playerId) || null;
  });
}

function buildStrategyToolTeam(team) {
  if (!team) return null;
  return {
    teamId: String(team.teamId || "").trim(),
    teamTricode: String(team.tricode || team.teamTricode || "").trim().toUpperCase(),
    teamName: String(team.nickname || team.teamName || team.fullName || "").trim(),
    score: 0,
  };
}

function ToolColumn({
  columnId,
  teamId,
  teams,
  playerIds,
  rosterMap,
  onTeamChange,
  onPlayerChange,
}) {
  const roster = useMemo(() => rosterMap[String(teamId || "")] || [], [rosterMap, teamId]);

  return (
    <section className={styles.toolColumn}>
      <label className={styles.field}>
        <select className={styles.select} value={teamId} onChange={(event) => onTeamChange(event.target.value)}>
          <option value="">Team</option>
          {teams.map((team) => (
            <option key={team.teamId} value={team.teamId}>{team.fullName}</option>
          ))}
        </select>
      </label>

      <div className={styles.playerFields}>
        {Array.from({ length: 5 }, (_, index) => {
          const selectedIds = new Set(playerIds.filter(Boolean));
          const currentId = playerIds[index] || "";
          selectedIds.delete(currentId);
          return (
            <label key={`${columnId}-player-${index}`} className={styles.field}>
              <select
                className={styles.select}
                value={currentId}
                onChange={(event) => onPlayerChange(index, event.target.value)}
                disabled={!teamId}
              >
                <option value="">Player</option>
                {roster.map((player) => (
                  <option
                    key={player.personId}
                    value={player.personId}
                    disabled={selectedIds.has(player.personId)}
                  >
                    {formatPlayerOption(player)}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </section>
  );
}

export default function Tools() {
  const { accountsEnabled, user, profile, hasFeature } = useAuth();
  const [params, setParams] = useSearchParams();
  const defaultDraft = useMemo(() => buildDefaultDraftForProfile(profile), [profile]);
  const defaultScoutingDraft = useMemo(() => buildDefaultScoutingDraftForProfile(profile), [profile]);
  const [draft, setDraft] = useState(defaultDraft);
  const [recordId, setRecordId] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [scoutingDraft, setScoutingDraft] = useState(defaultScoutingDraft);
  const [scoutingRecordId, setScoutingRecordId] = useState("");
  const [scoutingSaveStatus, setScoutingSaveStatus] = useState("");
  const [scoutingBusyAction, setScoutingBusyAction] = useState("");
  const [scoutingLoading, setScoutingLoading] = useState(false);
  const [scoutingError, setScoutingError] = useState("");
  const [scoutingResult, setScoutingResult] = useState(null);
  const defaultLateGameSetup = useMemo(() => buildLateGameToolSetup(profile), [profile]);
  const [lateGameSetup, setLateGameSetup] = useState(defaultLateGameSetup);
  const [lateGameVantageTeamId, setLateGameVantageTeamId] = useState("");
  const [lateGameOverrides, setLateGameOverrides] = useState(() => buildDefaultStrategyOverrides());
  const [lateGameManualOpen, setLateGameManualOpen] = useState(false);
  const [lateGameOverrideDraft, setLateGameOverrideDraft] = useState(() => buildStrategyOverrideDraft(null));

  const canUseTools = hasFeature("tools");
  const draftParam = String(params.get("draft") || "").trim();
  const packetParam = String(params.get("packet") || "").trim();
  const rawTab = String(params.get("tab") || "").trim();
  const activeTab = rawTab === TOOL_TABS.LATE_GAME
    ? TOOL_TABS.LATE_GAME
    : rawTab === TOOL_TABS.SCOUTING
      ? TOOL_TABS.SCOUTING
      : TOOL_TABS.MATCHUP;
  const { data: remoteNbaRostersPayload } = useQuery({
    queryKey: ["tools-current-nba-rosters"],
    queryFn: fetchCurrentNbaRosters,
    enabled: canUseTools,
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });
  const { data: remoteGLeagueRostersPayload } = useQuery({
    queryKey: ["tools-current-gleague-rosters"],
    queryFn: fetchCurrentGLeagueRosters,
    enabled: canUseTools,
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });

  const nbaRosterMap = useMemo(() => {
    const remoteTeams = remoteNbaRostersPayload?.teams && typeof remoteNbaRostersPayload.teams === "object"
      ? remoteNbaRostersPayload.teams
      : {};
    const next = {};
    NBA_TEAMS.forEach((team) => {
      const remoteRoster = Array.isArray(remoteTeams?.[team.teamId]?.players)
        ? remoteTeams[team.teamId].players.map((player) => ({
          personId: String(player?.personId || "").trim(),
          firstName: String(player?.firstName || "").trim(),
          familyName: String(player?.familyName || "").trim(),
          fullName: String(player?.fullName || "").trim(),
          jerseyNum: String(player?.jerseyNum || "").trim(),
          teamId: String(player?.teamId || team.teamId).trim() || team.teamId,
        })).filter((player) => player.personId && player.fullName)
        : [];
      next[team.teamId] = remoteRoster.length ? remoteRoster : getNbaTeamRoster(team.teamId);
    });
    return next;
  }, [remoteNbaRostersPayload]);

  const gLeagueRosterMap = useMemo(() => {
    const remoteTeams = remoteGLeagueRostersPayload?.teams && typeof remoteGLeagueRostersPayload.teams === "object"
      ? remoteGLeagueRostersPayload.teams
      : {};
    const next = {};
    GLEAGUE_TEAMS.forEach((team) => {
      next[team.teamId] = Array.isArray(remoteTeams?.[team.teamId]?.players)
        ? remoteTeams[team.teamId].players.map((player) => ({
          personId: String(player?.personId || "").trim(),
          firstName: String(player?.firstName || "").trim(),
          familyName: String(player?.familyName || "").trim(),
          fullName: String(player?.fullName || "").trim(),
          jerseyNum: String(player?.jerseyNum || "").trim(),
          teamId: String(player?.teamId || team.teamId).trim() || team.teamId,
        })).filter((player) => player.personId && player.fullName)
        : [];
    });
    return next;
  }, [remoteGLeagueRostersPayload]);

  const league = draft.league === "gleague" ? "gleague" : "nba";
  const availableTeams = league === "gleague" ? GLEAGUE_TEAMS : NBA_TEAMS;
  const scoutingLeague = scoutingDraft.league === "gleague" ? "gleague" : "nba";
  const scoutingTeams = scoutingLeague === "gleague" ? GLEAGUE_TEAMS : NBA_TEAMS;
  const selectedScoutingTeam = useMemo(
    () => getLeagueTeam(scoutingDraft.teamId, scoutingLeague),
    [scoutingDraft.teamId, scoutingLeague]
  );
  const rosterMap = league === "gleague" ? gLeagueRosterMap : nbaRosterMap;
  const remoteRostersPayload = league === "gleague" ? remoteGLeagueRostersPayload : remoteNbaRostersPayload;
  const leftRoster = useMemo(() => rosterMap[String(draft.leftTeamId || "")] || [], [draft.leftTeamId, rosterMap]);
  const rightRoster = useMemo(() => rosterMap[String(draft.rightTeamId || "")] || [], [draft.rightTeamId, rosterMap]);
  const leftTeam = useMemo(() => getLeagueTeam(draft.leftTeamId, league), [draft.leftTeamId, league]);
  const rightTeam = useMemo(() => getLeagueTeam(draft.rightTeamId, league), [draft.rightTeamId, league]);
  const lateGameLeague = lateGameSetup.league === "gleague" ? "gleague" : "nba";
  const lateGameTeams = lateGameLeague === "gleague" ? GLEAGUE_TEAMS : NBA_TEAMS;
  const lateGameAwayTeam = useMemo(
    () => buildStrategyToolTeam(getLeagueTeam(lateGameSetup.awayTeamId, lateGameLeague)),
    [lateGameLeague, lateGameSetup.awayTeamId]
  );
  const lateGameHomeTeam = useMemo(
    () => buildStrategyToolTeam(getLeagueTeam(lateGameSetup.homeTeamId, lateGameLeague)),
    [lateGameLeague, lateGameSetup.homeTeamId]
  );
  const selectedLeftPlayers = useMemo(
    () => resolveSelectedPlayers(draft.leftPlayerIds, leftRoster),
    [draft.leftPlayerIds, leftRoster]
  );
  const selectedRightPlayers = useMemo(
    () => resolveSelectedPlayers(draft.rightPlayerIds, rightRoster),
    [draft.rightPlayerIds, rightRoster]
  );
  const exportReady = Boolean(
    leftTeam &&
    rightTeam &&
    draft.logoTeamId &&
    selectedLeftPlayers.every(Boolean) &&
    selectedRightPlayers.every(Boolean)
  );

  useEffect(() => {
    if (!lateGameAwayTeam?.teamId || !lateGameHomeTeam?.teamId) return;
    const current = String(lateGameVantageTeamId || "").trim();
    if (current === String(lateGameAwayTeam.teamId) || current === String(lateGameHomeTeam.teamId)) return;
    setLateGameVantageTeamId(String(lateGameAwayTeam.teamId));
  }, [lateGameAwayTeam?.teamId, lateGameHomeTeam?.teamId, lateGameVantageTeamId]);

  const lateGameStrategyResult = useMemo(() => {
    if (!lateGameAwayTeam || !lateGameHomeTeam) {
      return {
        strategyState: null,
        strategyEvaluation: {
          status: "inactive",
          headline: "Late Game Strategy unavailable",
          summary: "Select both teams to start the Late Game Matrix tool.",
          notes: [],
          blindSpots: [],
        },
      };
    }

    const simulationGame = {
      gameStatus: 3,
      period: 4,
      gameClock: "PT30S",
      awayTeam: lateGameAwayTeam,
      homeTeam: lateGameHomeTeam,
      playByPlayActions: [],
    };
    const strategyState = buildLateGameStrategyState({
      game: simulationGame,
      vantageTeamId: lateGameVantageTeamId || lateGameAwayTeam.teamId,
      awayFouls: 0,
      homeFouls: 0,
      awayTimeoutsRemaining: 0,
      homeTimeoutsRemaining: 0,
      manualOverrides: lateGameOverrides,
    });

    return {
      strategyState,
      strategyEvaluation: evaluateLateGameStrategy(strategyState),
    };
  }, [lateGameAwayTeam, lateGameHomeTeam, lateGameOverrides, lateGameVantageTeamId]);
  const { strategyState: lateGameStrategyState, strategyEvaluation: lateGameStrategyEvaluation } = lateGameStrategyResult;
  const lateGameStrategyRangeRecommendations = useMemo(() => {
    if (!lateGameStrategyState?.manualOverrides?.scoreDiffRange) return [];
    const margins = buildMarginRange(lateGameStrategyState.manualOverrides.scoreDiff, lateGameStrategyState.manualOverrides.scoreDiffEnd);
    if (margins.length <= 1 || !lateGameAwayTeam || !lateGameHomeTeam) return [];
    return margins.map((margin) => {
      const simulationGame = {
        gameStatus: 3,
        period: 4,
        gameClock: "PT30S",
        awayTeam: lateGameAwayTeam,
        homeTeam: lateGameHomeTeam,
        playByPlayActions: [],
      };
      const strategyState = buildLateGameStrategyState({
        game: simulationGame,
        vantageTeamId: lateGameVantageTeamId || lateGameAwayTeam.teamId,
        awayFouls: 0,
        homeFouls: 0,
        awayTimeoutsRemaining: 0,
        homeTimeoutsRemaining: 0,
        manualOverrides: {
          ...lateGameOverrides,
          scoreDiff: String(margin),
          scoreDiffRange: false,
          scoreDiffEnd: "",
        },
      });
      const recommendation = evaluateLateGameStrategy(strategyState);
      return {
        key: `${margin}:${recommendation?.recommendation?.ruleId || recommendation?.status || "na"}`,
        margin,
        marginLabel: getMarginOptionLabel(margin),
        recommendation: recommendation.recommendation || recommendation,
      };
    });
  }, [
    lateGameAwayTeam,
    lateGameHomeTeam,
    lateGameOverrides,
    lateGameStrategyState?.manualOverrides?.scoreDiff,
    lateGameStrategyState?.manualOverrides?.scoreDiffEnd,
    lateGameStrategyState?.manualOverrides?.scoreDiffRange,
    lateGameVantageTeamId,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      if (!draftParam || !user?.id) {
        if (cancelled) return;
        setRecordId("");
        setDraft(defaultDraft);
        setSaveStatus("");
        return;
      }

      let savedRecord = null;
      try {
        savedRecord = accountsEnabled
          ? await getSavedToolRecordRemote(user.id, draftParam)
          : getSavedToolRecord(user.id, draftParam);
      } catch (error) {
        console.error("Failed to load remote tool draft, falling back to local storage.", error);
        savedRecord = getSavedToolRecord(user.id, draftParam);
      }

      if (cancelled) return;

      if (!savedRecord?.payload) {
        setRecordId("");
        setDraft(defaultDraft);
        setSaveStatus("");
        return;
      }

      setRecordId(savedRecord.id);
      setDraft(hydrateDraftPayload(savedRecord.payload, defaultDraft));
      setSaveStatus(`Loaded ${savedRecord.title}`);
    }

    loadDraft();

    return () => {
      cancelled = true;
    };
  }, [accountsEnabled, defaultDraft, draftParam, user?.id]);

  useEffect(() => {
    if (draftParam) return;
    setDraft((current) => (isDraftBlank(current) ? defaultDraft : current));
  }, [defaultDraft, draftParam]);

  useEffect(() => {
    let cancelled = false;

    async function loadPacket() {
      if (!packetParam || !user?.id) {
        if (cancelled) return;
        setScoutingRecordId("");
        setScoutingDraft(defaultScoutingDraft);
        setScoutingResult(null);
        setScoutingSaveStatus("");
        setScoutingError("");
        return;
      }

      let savedRecord = null;
      try {
        savedRecord = accountsEnabled
          ? await getSavedToolRecordRemote(user.id, packetParam)
          : getSavedToolRecord(user.id, packetParam);
      } catch (error) {
        console.error("Failed to load remote scouting packet, falling back to local storage.", error);
        savedRecord = getSavedToolRecord(user.id, packetParam);
      }

      if (cancelled) return;

      if (!savedRecord?.payload) {
        setScoutingRecordId("");
        setScoutingDraft(defaultScoutingDraft);
        setScoutingResult(null);
        setScoutingSaveStatus("");
        setScoutingError("");
        return;
      }

      setScoutingRecordId(savedRecord.id);
      setScoutingDraft(hydrateScoutingPayload(savedRecord.payload, defaultScoutingDraft));
      setScoutingResult(savedRecord.payload?.scoutingResult || savedRecord.payload?.packetResult || null);
      setScoutingSaveStatus(`Loaded ${savedRecord.title}`);
      setScoutingError("");
    }

    loadPacket();

    return () => {
      cancelled = true;
    };
  }, [accountsEnabled, defaultScoutingDraft, packetParam, user?.id]);

  useEffect(() => {
    if (packetParam) return;
    setScoutingDraft((current) => (current?.teamId || scoutingResult ? current : defaultScoutingDraft));
  }, [defaultScoutingDraft, packetParam, scoutingResult]);

  useEffect(() => {
    setLateGameSetup((current) => (
      current.awayTeamId || current.homeTeamId ? current : defaultLateGameSetup
    ));
  }, [defaultLateGameSetup]);

  if (accountsEnabled && !canUseTools) {
    return (
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.kicker}>Tools</div>
          <h1 className={styles.title}>Access Required</h1>
          <p className={styles.subtitle}>An admin needs to grant the Tools feature flag before you can use this page.</p>
        </section>
      </div>
    );
  }

  const handleTeamChange = (side, nextTeamId) => {
    setDraft((current) => ({
      ...current,
      [`${side}TeamId`]: nextTeamId,
      [`${side}PlayerIds`]: [...EMPTY_PLAYER_IDS],
    }));
    setSaveStatus("");
  };

  const handlePlayerChange = (side, index, nextPlayerId) => {
    setDraft((current) => {
      const key = `${side}PlayerIds`;
      const nextIds = [...current[key]];
      nextIds[index] = String(nextPlayerId || "").trim();
      return {
        ...current,
        [key]: nextIds,
      };
    });
    setSaveStatus("");
  };

  const handleLeagueChange = (nextLeague) => {
    const normalizedLeague = nextLeague === "gleague" ? "gleague" : "nba";
    setDraft(buildDefaultDraftForLeague(normalizedLeague, profile?.team_scopes));
    setSaveStatus("");
  };

  const updateScoutingDraft = (patch) => {
    setScoutingDraft((current) => ({
      ...current,
      ...patch,
    }));
    setScoutingResult(null);
    setScoutingError("");
    setScoutingSaveStatus("");
  };

  const handleToolTabChange = (nextTab) => {
    const normalized = nextTab === TOOL_TABS.LATE_GAME
      ? TOOL_TABS.LATE_GAME
      : nextTab === TOOL_TABS.SCOUTING
        ? TOOL_TABS.SCOUTING
        : TOOL_TABS.MATCHUP;
    const nextParams = new URLSearchParams(params);
    if (normalized === TOOL_TABS.MATCHUP) {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", normalized);
    }
    setParams(nextParams, { replace: true });
  };

  const handleLateGameLeagueChange = (nextLeague) => {
    const normalizedLeague = nextLeague === "gleague" ? "gleague" : "nba";
    setLateGameSetup({
      league: normalizedLeague,
      awayTeamId: "",
      homeTeamId: "",
    });
    setLateGameVantageTeamId("");
    setLateGameOverrides(buildDefaultStrategyOverrides());
    setLateGameManualOpen(false);
    setLateGameOverrideDraft(buildStrategyOverrideDraft(null));
  };

  const handleLateGameTeamChange = (side, nextTeamId) => {
    setLateGameSetup((current) => ({
      ...current,
      [`${side}TeamId`]: nextTeamId,
    }));
  };

  const applyLateGameManualSituationOverride = () => {
    setLateGameOverrides((prev) => ({
      ...prev,
      period: lateGameOverrideDraft.period,
      clock: lateGameOverrideDraft.clock,
      scoreDiff: lateGameOverrideDraft.scoreDiff,
      scoreDiffRange: Boolean(lateGameOverrideDraft.scoreDiffRange),
      scoreDiffEnd: lateGameOverrideDraft.scoreDiffRange ? lateGameOverrideDraft.scoreDiffEnd : "",
      possessionTeamId: lateGameOverrideDraft.possessionTeamId,
      ourTimeouts: lateGameOverrideDraft.ourTimeouts,
      opponentTimeouts: lateGameOverrideDraft.opponentTimeouts,
      ourFouls: lateGameOverrideDraft.ourFouls,
      opponentFouls: lateGameOverrideDraft.opponentFouls,
    }));
  };

  const clearLateGameOverrides = () => {
    setLateGameOverrides(buildDefaultStrategyOverrides());
    setLateGameOverrideDraft(buildStrategyOverrideDraft(lateGameStrategyState));
  };

  const handleGenerateScoutingPacket = async () => {
    if (!scoutingDraft.teamId || scoutingLoading || scoutingBusyAction) return;
    if (scoutingDraft.rangeMode === "dates" && (!scoutingDraft.startDate || !scoutingDraft.endDate)) return;

    setScoutingLoading(true);
    setScoutingError("");
    setScoutingSaveStatus("");
    try {
      const result = await requestPregameScoutingPacket({
        teamId: scoutingDraft.teamId,
        mode: scoutingDraft.rangeMode,
        gameCount: Number.parseInt(scoutingDraft.previousGames, 10) || 5,
        startDate: scoutingDraft.startDate,
        endDate: scoutingDraft.endDate,
      });
      setScoutingResult(result);
    } catch (error) {
      console.error("Failed to generate pre-game scouting packet.", error);
      setScoutingError(error?.message || "Unable to generate the scouting packet.");
    } finally {
      setScoutingLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;
    if (busyAction) return;
    setBusyAction("save");
    const id = recordId || crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const record = {
      id,
      type: "matchup_graphic",
      title: buildDraftTitle(draft),
      updatedAt: timestamp,
      createdAt: timestamp,
      payload: draft,
    };

    try {
      const savedRecord = accountsEnabled
        ? await saveToolRecordRemote(user.id, record)
        : saveToolRecord(user.id, record);
      if (!savedRecord) return;
      setRecordId(savedRecord.id);
      const nextParams = new URLSearchParams(params);
      nextParams.set("draft", savedRecord.id);
      setParams(nextParams, { replace: true });
      setSaveStatus(`Saved to My Vault as ${savedRecord.title}`);
    } catch (error) {
      console.error("Failed to save tool draft remotely, falling back to local storage.", error);
      const savedRecord = saveToolRecord(user.id, record);
      if (!savedRecord) return;
      setRecordId(savedRecord.id);
      const nextParams = new URLSearchParams(params);
      nextParams.set("draft", savedRecord.id);
      setParams(nextParams, { replace: true });
      setSaveStatus(`Saved locally as ${savedRecord.title}`);
    } finally {
      setBusyAction("");
    }
  };

  const handleDelete = async () => {
    if (!user?.id || !recordId) return;
    const confirmed = window.confirm("Delete this saved match-up draft?");
    if (!confirmed) return;
    if (busyAction) return;
    setBusyAction("delete");
    try {
      if (accountsEnabled) {
        await deleteSavedToolRecordRemote(user.id, recordId);
      } else {
        deleteSavedToolRecord(user.id, recordId);
      }
      setRecordId("");
      setDraft(defaultDraft);
      const nextParams = new URLSearchParams(params);
      nextParams.delete("draft");
      setParams(nextParams, { replace: true });
      setSaveStatus("Deleted saved draft.");
    } catch (error) {
      console.error("Failed to delete remote tool draft, falling back to local storage.", error);
      deleteSavedToolRecord(user.id, recordId);
      setRecordId("");
      setDraft(defaultDraft);
      const nextParams = new URLSearchParams(params);
      nextParams.delete("draft");
      setParams(nextParams, { replace: true });
      setSaveStatus("Deleted saved draft locally.");
    } finally {
      setBusyAction("");
    }
  };

  const handleReset = () => {
    const confirmed = window.confirm("Are you sure you want to reset this match-up graphic?");
    if (!confirmed) return;
    setDraft(defaultDraft);
    setRecordId("");
    const nextParams = new URLSearchParams(params);
    nextParams.delete("draft");
    setParams(nextParams, { replace: true });
    setSaveStatus("Reset match-up graphic.");
  };

  const handleExport = async () => {
    if (!exportReady || busyAction) return;
    setBusyAction("export");
    setSaveStatus("Rendering export...");
    try {
      await exportMatchupGraphic({
        league,
        leftPlayers: selectedLeftPlayers,
        rightPlayers: selectedRightPlayers,
        logoTeamId: draft.logoTeamId,
        leftTeam,
        rightTeam,
      });
      setSaveStatus("Exported match-up PNG.");
    } catch (error) {
      console.error("Failed to export match-up graphic.", error);
      setSaveStatus("Export failed. Please try again.");
    } finally {
      setBusyAction("");
    }
  };

  const handleSaveScoutingPacket = async () => {
    if (!user?.id || !scoutingResult || scoutingBusyAction || scoutingLoading) return;
    setScoutingBusyAction("save");
    const id = scoutingRecordId || crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const record = {
      id,
      type: TOOL_RECORD_TYPES.PREGAME_SCOUTING_PACKET,
      title: buildScoutingRecordTitle(scoutingDraft),
      updatedAt: timestamp,
      createdAt: timestamp,
      payload: {
        scoutingDraft,
        scoutingResult,
      },
    };

    try {
      const savedRecord = accountsEnabled
        ? await saveToolRecordRemote(user.id, record)
        : saveToolRecord(user.id, record);
      if (!savedRecord) return;
      setScoutingRecordId(savedRecord.id);
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", TOOL_TABS.SCOUTING);
      nextParams.set("packet", savedRecord.id);
      setParams(nextParams, { replace: true });
      setScoutingSaveStatus(`Saved to My Vault as ${savedRecord.title}`);
    } catch (error) {
      console.error("Failed to save scouting packet remotely, falling back to local storage.", error);
      const savedRecord = saveToolRecord(user.id, record);
      if (!savedRecord) return;
      setScoutingRecordId(savedRecord.id);
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", TOOL_TABS.SCOUTING);
      nextParams.set("packet", savedRecord.id);
      setParams(nextParams, { replace: true });
      setScoutingSaveStatus(`Saved locally as ${savedRecord.title}`);
    } finally {
      setScoutingBusyAction("");
    }
  };

  const handleDeleteScoutingPacket = async () => {
    if (!user?.id || !scoutingRecordId || scoutingBusyAction) return;
    const confirmed = window.confirm("Delete this saved scouting packet?");
    if (!confirmed) return;
    setScoutingBusyAction("delete");
    try {
      if (accountsEnabled) {
        await deleteSavedToolRecordRemote(user.id, scoutingRecordId);
      } else {
        deleteSavedToolRecord(user.id, scoutingRecordId);
      }
      setScoutingRecordId("");
      setScoutingDraft(defaultScoutingDraft);
      setScoutingResult(null);
      const nextParams = new URLSearchParams(params);
      nextParams.delete("packet");
      if (activeTab === TOOL_TABS.SCOUTING) {
        nextParams.set("tab", TOOL_TABS.SCOUTING);
      }
      setParams(nextParams, { replace: true });
      setScoutingSaveStatus("Deleted saved scouting packet.");
      setScoutingError("");
    } catch (error) {
      console.error("Failed to delete remote scouting packet, falling back to local storage.", error);
      deleteSavedToolRecord(user.id, scoutingRecordId);
      setScoutingRecordId("");
      setScoutingDraft(defaultScoutingDraft);
      setScoutingResult(null);
      const nextParams = new URLSearchParams(params);
      nextParams.delete("packet");
      if (activeTab === TOOL_TABS.SCOUTING) {
        nextParams.set("tab", TOOL_TABS.SCOUTING);
      }
      setParams(nextParams, { replace: true });
      setScoutingSaveStatus("Deleted saved scouting packet locally.");
      setScoutingError("");
    } finally {
      setScoutingBusyAction("");
    }
  };

  const handleResetScoutingPacket = () => {
    const confirmed = window.confirm("Are you sure you want to reset this scouting packet?");
    if (!confirmed) return;
    setScoutingDraft(defaultScoutingDraft);
    setScoutingRecordId("");
    setScoutingResult(null);
    setScoutingError("");
    setScoutingSaveStatus("Reset scouting packet.");
    const nextParams = new URLSearchParams(params);
    nextParams.delete("packet");
    nextParams.set("tab", TOOL_TABS.SCOUTING);
    setParams(nextParams, { replace: true });
  };

  const logoPreviewUrl = draft.logoTeamId ? teamLogoUrl(draft.logoTeamId, league) : "";
  const scoutingRangeMode = scoutingDraft.rangeMode === "dates" ? "dates" : "games";
  const scoutingGenerateDisabled = !scoutingDraft.teamId ||
    scoutingLoading ||
    Boolean(scoutingBusyAction) ||
    (scoutingRangeMode === "dates" && (!scoutingDraft.startDate || !scoutingDraft.endDate));

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.kicker}>Tools</div>
        <h1 className={styles.title}>Coaching Tools</h1>
        <p className={styles.subtitle}>Use the match-up workspace, the pre-game scouting packet generator, or the Late Game Matrix simulator from one place.</p>
      </section>

      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === TOOL_TABS.MATCHUP ? styles.tabButtonActive : ""}`}
          onClick={() => handleToolTabChange(TOOL_TABS.MATCHUP)}
        >
          Match-Up Graphic
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === TOOL_TABS.SCOUTING ? styles.tabButtonActive : ""}`}
          onClick={() => handleToolTabChange(TOOL_TABS.SCOUTING)}
        >
          Pre-Game Scouting Packet
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === TOOL_TABS.LATE_GAME ? styles.tabButtonActive : ""}`}
          onClick={() => handleToolTabChange(TOOL_TABS.LATE_GAME)}
        >
          Late Game Matrix
        </button>
      </div>

      {activeTab === TOOL_TABS.MATCHUP ? (
        <section className={styles.workspace}>
          {!remoteRostersPayload?.teams ? (
            <p className={styles.statusNote}>
              {league === "gleague"
                ? "Live G League rosters will appear here once the `gleague-rosters` Supabase function is deployed."
                : "Live NBA rosters will appear here once the `nba-rosters` Supabase function is deployed. Until then, this page falls back to the bundled roster snapshot."}
            </p>
          ) : null}

          <label className={`${styles.field} ${styles.leagueField}`}>
            <select
              className={styles.select}
              value={league}
              onChange={(event) => handleLeagueChange(event.target.value)}
            >
              <option value="nba">NBA</option>
              <option value="gleague">G League</option>
            </select>
          </label>

          <div className={styles.toolGrid}>
            <ToolColumn
              columnId="left"
              teamId={draft.leftTeamId}
              teams={availableTeams}
              playerIds={draft.leftPlayerIds}
              rosterMap={rosterMap}
              onTeamChange={(nextTeamId) => handleTeamChange("left", nextTeamId)}
              onPlayerChange={(index, nextPlayerId) => handlePlayerChange("left", index, nextPlayerId)}
            />

            <ToolColumn
              columnId="right"
              teamId={draft.rightTeamId}
              teams={availableTeams}
              playerIds={draft.rightPlayerIds}
              rosterMap={rosterMap}
              onTeamChange={(nextTeamId) => handleTeamChange("right", nextTeamId)}
              onPlayerChange={(index, nextPlayerId) => handlePlayerChange("right", index, nextPlayerId)}
            />
          </div>

          <div className={styles.footerRow}>
            <label className={`${styles.field} ${styles.logoField}`}>
              <span className={styles.fieldLabel}>Logo</span>
              <select
                className={styles.select}
                value={draft.logoTeamId}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, logoTeamId: event.target.value }));
                  setSaveStatus("");
                }}
              >
                <option value="">Logo</option>
                {availableTeams.map((team) => (
                  <option key={`logo-${team.teamId}`} value={team.teamId}>{team.fullName}</option>
                ))}
              </select>
            </label>

            {logoPreviewUrl ? (
              <div className={styles.logoPreview}>
                <img src={logoPreviewUrl} alt="" />
              </div>
            ) : null}

            <div className={styles.actionCluster}>
              {recordId ? (
                <button type="button" className={styles.secondaryButton} onClick={handleDelete} disabled={Boolean(busyAction)}>
                  Delete
                </button>
              ) : null}
              <button type="button" className={styles.secondaryButton} onClick={handleReset} disabled={Boolean(busyAction)}>
                Reset
              </button>
              <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={Boolean(busyAction)}>
                Save
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleExport}
                disabled={!exportReady || Boolean(busyAction)}
                title={exportReady ? "Export the matchup graphic as a PNG" : "Select both teams, all ten players, and a logo first"}
              >
                {busyAction === "export" ? "Exporting..." : "Export"}
              </button>
            </div>
          </div>

          {saveStatus ? <div className={styles.statusNote}>{saveStatus}</div> : null}
        </section>
      ) : activeTab === TOOL_TABS.SCOUTING ? (
        <section className={styles.workspace}>
          <p className={styles.statusNote}>
            Generate an opponent packet from a recent game sample or a custom date window. This first pass focuses on team trends, key players, lineup usage, and recent results.
          </p>

          <div className={styles.scoutingSetupGrid}>
            <label className={`${styles.field} ${styles.leagueField}`}>
              <span className={styles.fieldLabel}>League</span>
              <select
                className={styles.select}
                value={scoutingLeague}
                onChange={(event) => updateScoutingDraft({
                  league: event.target.value === "gleague" ? "gleague" : "nba",
                  teamId: "",
                })}
              >
                <option value="nba">NBA</option>
                <option value="gleague">G League</option>
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Target Team</span>
              <select
                className={styles.select}
                value={scoutingDraft.teamId}
                onChange={(event) => updateScoutingDraft({ teamId: event.target.value })}
              >
                <option value="">Select team</option>
                {scoutingTeams.map((team) => (
                  <option key={`scouting-${team.teamId}`} value={team.teamId}>{team.fullName}</option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Range Mode</span>
              <select
                className={styles.select}
                value={scoutingRangeMode}
                onChange={(event) => updateScoutingDraft({ rangeMode: event.target.value === "dates" ? "dates" : "games" })}
              >
                <option value="games">By Game</option>
                <option value="dates">By Date</option>
              </select>
            </label>

            {scoutingRangeMode === "games" ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Window</span>
                <select
                  className={styles.select}
                  value={scoutingDraft.previousGames}
                  onChange={(event) => updateScoutingDraft({ previousGames: event.target.value })}
                >
                  {PREVIOUS_GAME_OPTIONS.map((count) => (
                    <option key={`previous-${count}`} value={String(count)}>
                      {count === 1 ? "Previous Game" : `Previous ${count} Games`}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Start Date</span>
                  <input
                    className={styles.select}
                    type="date"
                    value={scoutingDraft.startDate}
                    onChange={(event) => updateScoutingDraft({ startDate: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>End Date</span>
                  <input
                    className={styles.select}
                    type="date"
                    value={scoutingDraft.endDate}
                    onChange={(event) => updateScoutingDraft({ endDate: event.target.value })}
                  />
                </label>
              </>
            )}
          </div>

          <div className={styles.actionCluster}>
            {scoutingRecordId ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleDeleteScoutingPacket}
                disabled={scoutingLoading || Boolean(scoutingBusyAction)}
              >
                {scoutingBusyAction === "delete" ? "Deleting..." : "Delete"}
              </button>
            ) : null}
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleResetScoutingPacket}
              disabled={scoutingLoading || Boolean(scoutingBusyAction)}
            >
              Reset
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleSaveScoutingPacket}
              disabled={!scoutingResult || scoutingLoading || Boolean(scoutingBusyAction)}
            >
              {scoutingBusyAction === "save" ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleGenerateScoutingPacket}
              disabled={scoutingGenerateDisabled}
            >
              {scoutingLoading ? "Generating..." : "Generate"}
            </button>
          </div>

          {scoutingError ? <div className={styles.statusError}>{scoutingError}</div> : null}
          {scoutingSaveStatus ? <div className={styles.statusNote}>{scoutingSaveStatus}</div> : null}

          {scoutingResult ? (
            <div className={styles.scoutingResult}>
              <div className={styles.scoutingResultHeader}>
                <div>
                  <div className={styles.scoutingEyebrow}>
                    {selectedScoutingTeam?.fullName || scoutingResult.team?.name || "Scouting Packet"}
                  </div>
                  <h2 className={styles.scoutingHeadline}>{scoutingResult.headline || buildScoutingRecordTitle(scoutingDraft)}</h2>
                </div>
                <div className={styles.scoutingMeta}>
                  {scoutingResult.rangeLabel || scoutingResult.selection?.rangeLabel || buildScoutingRangeLabel(scoutingDraft)}
                </div>
              </div>

              {scoutingResult.summary ? (
                <p className={styles.scoutingSummary}>{scoutingResult.summary}</p>
              ) : null}

              {Array.isArray(scoutingResult.sections) && scoutingResult.sections.length ? (
                <div className={styles.scoutingSections}>
                  {scoutingResult.sections.map((section) => (
                    <section key={section.title} className={styles.scoutingSection}>
                      <div className={styles.scoutingSectionTitle}>{section.title}</div>
                      <ul className={styles.scoutingList}>
                        {(Array.isArray(section.items) ? section.items : []).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : null}

              {scoutingResult.packetDetails ? (
                <div className={styles.scoutingDetailGrid}>
                  {[
                    ["Sample Window", scoutingResult.packetDetails.sampleNotes],
                    ["Offensive Profile", scoutingResult.packetDetails.offensiveProfile],
                    ["Defensive Profile", scoutingResult.packetDetails.defensiveProfile],
                    ["Key Players", scoutingResult.packetDetails.playerNotes],
                    ["Notable Stats", scoutingResult.packetDetails.notableStats],
                    ["Lineup Notes", scoutingResult.packetDetails.lineupNotes],
                    ["Recent Games", scoutingResult.packetDetails.recentGames],
                  ].map(([title, items]) => (
                    Array.isArray(items) && items.length ? (
                      <section key={title} className={styles.scoutingDetailCard}>
                        <div className={styles.scoutingDetailTitle}>{title}</div>
                        <ul className={styles.scoutingList}>
                          {items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </section>
                    ) : null
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : (
        <section className={styles.workspace}>
          <p className={styles.statusNote}>
            This uses the same Late Game Matrix engine as the game page, but runs in manual simulation mode so you can test scenarios without a live game.
          </p>

          <div className={styles.matrixSetupGrid}>
            <label className={`${styles.field} ${styles.leagueField}`}>
              <span className={styles.fieldLabel}>League</span>
              <select
                className={styles.select}
                value={lateGameLeague}
                onChange={(event) => handleLateGameLeagueChange(event.target.value)}
              >
                <option value="nba">NBA</option>
                <option value="gleague">G League</option>
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Away Team</span>
              <select
                className={styles.select}
                value={lateGameSetup.awayTeamId}
                onChange={(event) => handleLateGameTeamChange("away", event.target.value)}
              >
                <option value="">Select away team</option>
                {lateGameTeams.map((team) => (
                  <option key={`late-away-${team.teamId}`} value={team.teamId}>{team.fullName}</option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Home Team</span>
              <select
                className={styles.select}
                value={lateGameSetup.homeTeamId}
                onChange={(event) => handleLateGameTeamChange("home", event.target.value)}
              >
                <option value="">Select home team</option>
                {lateGameTeams.map((team) => (
                  <option
                    key={`late-home-${team.teamId}`}
                    value={team.teamId}
                    disabled={team.teamId === lateGameSetup.awayTeamId}
                  >
                    {team.fullName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <LateGameMatrixPanel
            title="Late Game Matrix Simulator"
            awayTeam={lateGameAwayTeam}
            homeTeam={lateGameHomeTeam}
            strategyState={lateGameStrategyState}
            strategyEvaluation={lateGameStrategyEvaluation}
            strategyVantageTeamId={lateGameVantageTeamId}
            setStrategyVantageTeamId={setLateGameVantageTeamId}
            strategyOverrides={lateGameOverrides}
            setStrategyOverrides={setLateGameOverrides}
            strategyManualOpen={lateGameManualOpen}
            setStrategyManualOpen={setLateGameManualOpen}
            strategyOverrideDraft={lateGameOverrideDraft}
            setStrategyOverrideDraft={setLateGameOverrideDraft}
            onApplyManualSituationOverride={applyLateGameManualSituationOverride}
            onClearStrategyOverrides={clearLateGameOverrides}
            strategyRangeRecommendations={lateGameStrategyRangeRecommendations}
          />
        </section>
      )}
    </div>
  );
}
