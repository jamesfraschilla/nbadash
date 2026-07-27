import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCurrentGLeagueRosters, fetchCurrentNbaRosters, teamLogoUrl } from "../api.js";
import { useAuth } from "../auth/useAuth.js";
import {
  deleteGraphicHeadshot,
  getGraphicHeadshotPublicUrl,
  uploadGraphicHeadshot,
  uploadLegacyGraphicHeadshot,
} from "../graphicHeadshotStorage.js";
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
import DepthChartGraphicAdmin from "./DepthChartGraphicAdmin.jsx";
import PersonnelGraphicAdmin from "./PersonnelGraphicAdmin.jsx";
import VisualDrillGenerator from "./VisualDrillGenerator.jsx";
import { requestCustomDashboardRequest } from "../customRequestsData.js";
import {
  buildMatchupGraphicLineupFromDraft,
  buildMatchupGraphicLineupMap,
  getDefaultMatchupGraphicTeamId,
  getMatchupGraphicLineupKey,
  listRemoteMatchupGraphicLineups,
  saveRemoteMatchupGraphicLineups,
} from "../matchupGraphicLineups.js";
import styles from "./Tools.module.css";

const EMPTY_PLAYER_IDS = Array(5).fill("");
const CUSTOM_PLAYER_VALUE = "__custom__";
const WIZARDS_TEAM_ID = "1610612764";
const CAPITAL_CITY_TEAM_ID = "1612709928";
const TOOL_TABS = {
  GRAPHICS: "graphics",
  MATCHUP: "matchup",
  PERSONNEL: "personnel",
  DEPTH_CHART: "depth-chart",
  SCOUTING: "scouting",
  LATE_GAME: "late-game",
  CUSTOM_REQUESTS: "custom-requests",
  VISUAL_DRILL: "visual-drill",
};
const PREVIOUS_GAME_OPTIONS = Array.from({ length: 20 }, (_, index) => index + 1);

function buildEmptyDraft() {
  return {
    league: "nba",
    leftTeamId: "",
    rightTeamId: "",
    leftPlayerIds: [...EMPTY_PLAYER_IDS],
    rightPlayerIds: [...EMPTY_PLAYER_IDS],
    leftCustomPlayers: buildEmptyCustomPlayers(),
    rightCustomPlayers: buildEmptyCustomPlayers(),
    logoTeamId: "",
  };
}

function buildEmptyCustomPlayer() {
  return {
    jerseyNum: "",
    lastName: "",
    headshotDataUrl: "",
    headshotUrl: "",
    headshotStoragePath: "",
  };
}

function buildEmptyCustomPlayers() {
  return EMPTY_PLAYER_IDS.map(() => buildEmptyCustomPlayer());
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
  const defaultTeamId = getDefaultMatchupGraphicTeamId(normalizedLeague, [...scopes]);
  if (defaultTeamId) {
    nextDraft.leftTeamId = defaultTeamId;
    nextDraft.logoTeamId = defaultTeamId;
  }

  return nextDraft;
}

function buildDefaultDraftForProfile(profile) {
  const scopes = normalizeTeamScopes(profile?.team_scopes);
  return buildDefaultDraftForLeague("nba", scopes);
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
  const customPlayerValues = [
    ...(Array.isArray(draft.leftCustomPlayers) ? draft.leftCustomPlayers : []),
    ...(Array.isArray(draft.rightCustomPlayers) ? draft.rightCustomPlayers : []),
  ];
  return !String(draft.leftTeamId || "").trim() &&
    !String(draft.rightTeamId || "").trim() &&
    !String(draft.logoTeamId || "").trim() &&
    !leftPlayerIds.some((value) => String(value || "").trim()) &&
    !rightPlayerIds.some((value) => String(value || "").trim()) &&
    !customPlayerValues.some((player) => (
      String(player?.jerseyNum || "").trim() ||
      String(player?.lastName || "").trim() ||
      String(player?.headshotDataUrl || player?.headshotUrl || "").trim()
    ));
}

function hydrateDraftPayload(payload, fallbackDraft) {
  const normalizedLeague = String(payload?.league || fallbackDraft?.league || "nba").trim() === "gleague" ? "gleague" : "nba";
  return {
    league: normalizedLeague,
    leftTeamId: String(payload?.leftTeamId || "").trim() || String(fallbackDraft?.leftTeamId || "").trim(),
    rightTeamId: String(payload?.rightTeamId || "").trim(),
    leftPlayerIds: [...EMPTY_PLAYER_IDS].map((_, index) => String(payload?.leftPlayerIds?.[index] || "").trim()),
    rightPlayerIds: [...EMPTY_PLAYER_IDS].map((_, index) => String(payload?.rightPlayerIds?.[index] || "").trim()),
    leftCustomPlayers: hydrateCustomPlayers(payload?.leftCustomPlayers),
    rightCustomPlayers: hydrateCustomPlayers(payload?.rightCustomPlayers),
    logoTeamId: String(payload?.logoTeamId || "").trim() || String(fallbackDraft?.logoTeamId || "").trim(),
  };
}

function hydrateCustomPlayers(value) {
  return EMPTY_PLAYER_IDS.map((_, index) => {
    const player = Array.isArray(value) && value[index] && typeof value[index] === "object" ? value[index] : {};
    const headshotStoragePath = String(player?.headshotStoragePath || "").trim();
    return {
      jerseyNum: String(player?.jerseyNum || player?.number || "").trim(),
      lastName: String(player?.lastName || player?.familyName || player?.fullName || "").trim(),
      headshotDataUrl: String(player?.headshotDataUrl || "").trim(),
      headshotUrl: getGraphicHeadshotPublicUrl(headshotStoragePath) || String(player?.headshotUrl || "").trim(),
      headshotStoragePath,
    };
  });
}

function serializeCustomPlayers(value) {
  return hydrateCustomPlayers(value).map((player) => ({
    jerseyNum: player.jerseyNum,
    lastName: player.lastName,
    headshotStoragePath: player.headshotStoragePath,
  }));
}

function serializeMatchupDraft(draft) {
  return {
    ...draft,
    leftCustomPlayers: serializeCustomPlayers(draft?.leftCustomPlayers),
    rightCustomPlayers: serializeCustomPlayers(draft?.rightCustomPlayers),
  };
}

async function migrateLegacyMatchupHeadshots(draft, userId) {
  let nextDraft = { ...draft };
  for (const side of ["left", "right"]) {
    const key = `${side}CustomPlayers`;
    const players = hydrateCustomPlayers(nextDraft[key]);
    for (let index = 0; index < players.length; index += 1) {
      const player = players[index];
      if (!player.headshotDataUrl || player.headshotStoragePath) continue;
      const uploaded = await uploadLegacyGraphicHeadshot({
        userId,
        dataUrl: player.headshotDataUrl,
        toolType: "matchup",
        slotKey: `${draft.league}-${side}-${index}`,
      });
      players[index] = {
        ...player,
        headshotDataUrl: "",
        headshotUrl: uploaded.publicUrl,
        headshotStoragePath: uploaded.storagePath,
      };
    }
    nextDraft = { ...nextDraft, [key]: players };
  }
  return nextDraft;
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
  const jersey = String(player?.jerseyNum || "").trim().replace(/^#+\s*/, "");
  return `${jersey ? `#${jersey}` : "#--"} ${player.fullName}`.trim();
}

function parseSortableNumeric(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  if (/^-?\d+(?:\.\d+)?\/-?\d+(?:\.\d+)?$/.test(raw)) {
    const [left, right] = raw.split("/").map(Number);
    return (left * 10000) + right;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const timestamp = Date.parse(`${raw}T00:00:00Z`);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (/^-?\d+\s+games?$/i.test(raw)) {
    return Number(raw.replace(/[^0-9.-]/g, ""));
  }
  if (/^-?\d+\s*-\s*-?\d+$/.test(raw)) {
    const [wins, losses] = raw.split("-").map((part) => Number(part.trim()));
    return (wins * 1000) - losses;
  }
  return null;
}

function compareSortableValues(left, right) {
  const leftNumeric = parseSortableNumeric(left);
  const rightNumeric = parseSortableNumeric(right);

  if (leftNumeric !== null && rightNumeric !== null) {
    return leftNumeric - rightNumeric;
  }

  return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function buildCustomMatchupPlayer(customPlayer, index, teamId) {
  const lastName = String(customPlayer?.lastName || "").trim();
  if (!lastName) return null;
  return {
    personId: `custom-matchup-${teamId || "team"}-${index}`,
    firstName: "",
    familyName: lastName,
    fullName: lastName,
    jerseyNum: String(customPlayer?.jerseyNum || "").trim(),
    teamId: String(teamId || "").trim(),
    headshotDataUrl: String(customPlayer?.headshotDataUrl || "").trim(),
    headshotUrl: String(customPlayer?.headshotUrl || "").trim(),
  };
}

function resolveSelectedPlayers(playerIds, roster, customPlayers, teamId) {
  const playersById = new Map((roster || []).map((player) => [player.personId, player]));
  return [...EMPTY_PLAYER_IDS].map((_, index) => {
    const playerId = String(playerIds?.[index] || "").trim();
    if (playerId === CUSTOM_PLAYER_VALUE) {
      return buildCustomMatchupPlayer(customPlayers?.[index], index, teamId);
    }
    return playersById.get(playerId) || null;
  });
}

function draftSideHasPlayerEdits(draft, side) {
  const playerIds = Array.isArray(draft?.[`${side}PlayerIds`]) ? draft[`${side}PlayerIds`] : [];
  const customPlayers = Array.isArray(draft?.[`${side}CustomPlayers`]) ? draft[`${side}CustomPlayers`] : [];
  return playerIds.some((value) => String(value || "").trim()) || customPlayers.some((player) => (
    String(player?.jerseyNum || "").trim()
    || String(player?.lastName || "").trim()
    || String(player?.headshotDataUrl || "").trim()
    || String(player?.headshotUrl || "").trim()
  ));
}

function applyTeamLineupToDraftSide(draft, side, lineup) {
  if (!lineup) return draft;
  return {
    ...draft,
    [`${side}PlayerIds`]: [...EMPTY_PLAYER_IDS].map((_, index) => (
      String(lineup.playerIds?.[index] || "").trim()
    )),
    [`${side}CustomPlayers`]: hydrateCustomPlayers(lineup.customPlayers),
  };
}

function mergeSharedLineupPlayersIntoRosterMap(rosterMap, lineupMap, league) {
  const next = Object.fromEntries(
    Object.entries(rosterMap || {}).map(([teamId, players]) => [teamId, [...(players || [])]])
  );
  Object.values(lineupMap || {}).forEach((lineup) => {
    if (lineup?.league !== league || !lineup?.teamId) return;
    const teamPlayers = next[lineup.teamId] || [];
    const knownIds = new Set(teamPlayers.map((player) => String(player?.personId || "").trim()).filter(Boolean));
    (lineup.players || []).forEach((player) => {
      const personId = String(player?.personId || "").trim();
      if (!personId || knownIds.has(personId)) return;
      teamPlayers.push(player);
      knownIds.add(personId);
    });
    next[lineup.teamId] = teamPlayers;
  });
  return next;
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
  customPlayers,
  onTeamChange,
  onPlayerChange,
  onCustomPlayerChange,
  onCustomHeadshotChange,
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
          const selectedIds = new Set(playerIds.filter((value) => value && value !== CUSTOM_PLAYER_VALUE));
          const currentId = playerIds[index] || "";
          const isCustom = currentId === CUSTOM_PLAYER_VALUE;
          const customPlayer = customPlayers?.[index] || buildEmptyCustomPlayer();
          selectedIds.delete(currentId);
          return (
            <div key={`${columnId}-player-${index}`} className={styles.matchupPlayerSlot}>
              <label className={styles.field}>
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
                  <option value={CUSTOM_PLAYER_VALUE}>Custom</option>
                </select>
              </label>
              {isCustom ? (
                <div className={styles.matchupCustomFields}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Number</span>
                    <input
                      className={styles.select}
                      value={customPlayer.jerseyNum}
                      onChange={(event) => onCustomPlayerChange(index, { jerseyNum: event.target.value })}
                      inputMode="numeric"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Last name</span>
                    <input
                      className={styles.select}
                      value={customPlayer.lastName}
                      onChange={(event) => onCustomPlayerChange(index, { lastName: event.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Headshot PNG</span>
                    <input
                      className={styles.select}
                      type="file"
                      accept="image/png"
                      onChange={(event) => onCustomHeadshotChange(index, event.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function Tools() {
  const { accountsEnabled, user, profile, hasFeature } = useAuth();
  const queryClient = useQueryClient();
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
  const [customPrompt, setCustomPrompt] = useState("");
  const [customRequestLoading, setCustomRequestLoading] = useState(false);
  const [customRequestError, setCustomRequestError] = useState("");
  const [customRequestResult, setCustomRequestResult] = useState(null);
  const [customTableSort, setCustomTableSort] = useState({ table: "", column: "", direction: "asc" });

  const canUseTools = !accountsEnabled || hasFeature("tools");
  const vaultUserId = user?.id || (!accountsEnabled ? "guest" : "");
  const draftParam = String(params.get("draft") || "").trim();
  const packetParam = String(params.get("packet") || "").trim();
  const rawTab = String(params.get("tab") || "").trim();
  const rawGraphic = String(params.get("graphic") || "").trim();
  const activeTab = rawTab === TOOL_TABS.LATE_GAME
    ? TOOL_TABS.LATE_GAME
    : rawTab === TOOL_TABS.CUSTOM_REQUESTS
      ? TOOL_TABS.CUSTOM_REQUESTS
    : rawTab === TOOL_TABS.VISUAL_DRILL
      ? TOOL_TABS.VISUAL_DRILL
    : rawTab === TOOL_TABS.SCOUTING
      ? TOOL_TABS.SCOUTING
      : TOOL_TABS.GRAPHICS;
  const legacyGraphicTab = [TOOL_TABS.MATCHUP, TOOL_TABS.PERSONNEL, TOOL_TABS.DEPTH_CHART].includes(rawTab)
    ? rawTab
    : "";
  const activeGraphic = [TOOL_TABS.MATCHUP, TOOL_TABS.PERSONNEL, TOOL_TABS.DEPTH_CHART].includes(rawGraphic)
    ? rawGraphic
    : legacyGraphicTab || TOOL_TABS.MATCHUP;
  const graphicsNeedBothLeagues = activeTab === TOOL_TABS.GRAPHICS
    && [TOOL_TABS.PERSONNEL, TOOL_TABS.DEPTH_CHART].includes(activeGraphic);
  const needsNbaRosters = canUseTools && (
    graphicsNeedBothLeagues
    || (activeTab === TOOL_TABS.GRAPHICS && activeGraphic === TOOL_TABS.MATCHUP && draft.league !== "gleague")
    || (activeTab === TOOL_TABS.SCOUTING && scoutingDraft.league !== "gleague")
  );
  const needsGLeagueRosters = canUseTools && (
    graphicsNeedBothLeagues
    || (activeTab === TOOL_TABS.GRAPHICS && activeGraphic === TOOL_TABS.MATCHUP && draft.league === "gleague")
    || (activeTab === TOOL_TABS.SCOUTING && scoutingDraft.league === "gleague")
  );
  const needsSharedMatchupLineups = canUseTools
    && activeTab === TOOL_TABS.GRAPHICS
    && activeGraphic === TOOL_TABS.MATCHUP;
  const { data: remoteNbaRostersPayload } = useQuery({
    queryKey: ["tools-current-nba-rosters"],
    queryFn: ({ signal }) => fetchCurrentNbaRosters({ signal }),
    enabled: needsNbaRosters,
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });
  const { data: remoteGLeagueRostersPayload } = useQuery({
    queryKey: ["tools-current-gleague-rosters"],
    queryFn: ({ signal }) => fetchCurrentGLeagueRosters({ signal }),
    enabled: needsGLeagueRosters,
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });
  const {
    data: sharedMatchupLineups = [],
    error: sharedMatchupLineupsError,
  } = useQuery({
    queryKey: ["matchup-graphic-team-lineups"],
    queryFn: listRemoteMatchupGraphicLineups,
    enabled: needsSharedMatchupLineups,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const sharedMatchupLineupMap = useMemo(
    () => buildMatchupGraphicLineupMap(sharedMatchupLineups),
    [sharedMatchupLineups]
  );

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
  const baseRosterMap = league === "gleague" ? gLeagueRosterMap : nbaRosterMap;
  const rosterMap = useMemo(
    () => mergeSharedLineupPlayersIntoRosterMap(baseRosterMap, sharedMatchupLineupMap, league),
    [baseRosterMap, league, sharedMatchupLineupMap]
  );
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
    () => resolveSelectedPlayers(draft.leftPlayerIds, leftRoster, draft.leftCustomPlayers, draft.leftTeamId),
    [draft.leftCustomPlayers, draft.leftPlayerIds, draft.leftTeamId, leftRoster]
  );
  const selectedRightPlayers = useMemo(
    () => resolveSelectedPlayers(draft.rightPlayerIds, rightRoster, draft.rightCustomPlayers, draft.rightTeamId),
    [draft.rightCustomPlayers, draft.rightPlayerIds, draft.rightTeamId, rightRoster]
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
      if (!draftParam || !vaultUserId) {
        if (cancelled) return;
        setRecordId("");
        setDraft((current) => (isDraftBlank(current) ? defaultDraft : current));
        setSaveStatus((current) => (String(current || "").startsWith("Loaded ") ? "" : current));
        return;
      }

      let savedRecord = null;
      try {
        savedRecord = accountsEnabled && user?.id
          ? await getSavedToolRecordRemote(user.id, draftParam)
          : getSavedToolRecord(vaultUserId, draftParam);
      } catch (error) {
        console.error("Failed to load remote tool draft, falling back to local storage.", error);
        savedRecord = getSavedToolRecord(vaultUserId, draftParam);
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
  }, [accountsEnabled, defaultDraft, draftParam, user?.id, vaultUserId]);

  useEffect(() => {
    if (draftParam) return;
    setDraft((current) => (isDraftBlank(current) ? defaultDraft : current));
  }, [defaultDraft, draftParam]);

  useEffect(() => {
    if (draftParam || !sharedMatchupLineups.length) return;
    setDraft((current) => {
      let next = current;
      ["left", "right"].forEach((side) => {
        const teamId = String(next?.[`${side}TeamId`] || "").trim();
        if (!teamId || draftSideHasPlayerEdits(next, side)) return;
        const lineup = sharedMatchupLineupMap[getMatchupGraphicLineupKey(next.league, teamId)];
        if (lineup) next = applyTeamLineupToDraftSide(next, side, lineup);
      });
      return next;
    });
  }, [draftParam, sharedMatchupLineupMap, sharedMatchupLineups.length]);

  useEffect(() => {
    let cancelled = false;

    async function loadPacket() {
      if (!packetParam || !vaultUserId) {
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
        savedRecord = accountsEnabled && user?.id
          ? await getSavedToolRecordRemote(user.id, packetParam)
          : getSavedToolRecord(vaultUserId, packetParam);
      } catch (error) {
        console.error("Failed to load remote scouting packet, falling back to local storage.", error);
        savedRecord = getSavedToolRecord(vaultUserId, packetParam);
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
  }, [accountsEnabled, defaultScoutingDraft, packetParam, user?.id, vaultUserId]);

  useEffect(() => {
    if (packetParam) return;
    setScoutingDraft((current) => (current?.teamId || scoutingResult ? current : defaultScoutingDraft));
  }, [defaultScoutingDraft, packetParam, scoutingResult]);

  useEffect(() => {
    setCustomTableSort({ table: "", column: "", direction: "asc" });
  }, [customRequestResult]);

  useEffect(() => {
    setLateGameSetup((current) => (
      current.awayTeamId || current.homeTeamId ? current : defaultLateGameSetup
    ));
  }, [defaultLateGameSetup]);

  const handleTeamChange = (side, nextTeamId) => {
    setDraft((current) => {
      const next = {
        ...current,
        [`${side}TeamId`]: nextTeamId,
        [`${side}PlayerIds`]: [...EMPTY_PLAYER_IDS],
        [`${side}CustomPlayers`]: buildEmptyCustomPlayers(),
      };
      const lineup = sharedMatchupLineupMap[getMatchupGraphicLineupKey(current.league, nextTeamId)];
      return lineup ? applyTeamLineupToDraftSide(next, side, lineup) : next;
    });
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

  const handleCustomPlayerChange = (side, index, patch) => {
    setDraft((current) => {
      const key = `${side}CustomPlayers`;
      const currentPlayers = hydrateCustomPlayers(current[key]);
      currentPlayers[index] = {
        ...currentPlayers[index],
        ...patch,
      };
      return {
        ...current,
        [key]: currentPlayers,
      };
    });
    setSaveStatus("");
  };

  const handleCustomHeadshotChange = async (side, index, file) => {
    const currentPlayer = hydrateCustomPlayers(draft[`${side}CustomPlayers`])[index];
    if (!file) {
      try {
        await deleteGraphicHeadshot(user?.id, currentPlayer?.headshotStoragePath);
      } catch (error) {
        setSaveStatus(error?.message || "Unable to remove the previous headshot.");
        return;
      }
      handleCustomPlayerChange(side, index, {
        headshotDataUrl: "",
        headshotUrl: "",
        headshotStoragePath: "",
      });
      return;
    }
    try {
      setSaveStatus("Uploading headshot...");
      const uploaded = await uploadGraphicHeadshot({
        userId: user?.id,
        file,
        toolType: "matchup",
        slotKey: `${draft.league}-${side}-${index}`,
        previousPath: currentPlayer?.headshotStoragePath,
      });
      handleCustomPlayerChange(side, index, {
        headshotDataUrl: "",
        headshotUrl: uploaded.publicUrl,
        headshotStoragePath: uploaded.storagePath,
      });
      setSaveStatus("");
    } catch (error) {
      setSaveStatus(error?.message || "Unable to load headshot.");
    }
  };

  const handleLeagueChange = (nextLeague) => {
    const normalizedLeague = nextLeague === "gleague" ? "gleague" : "nba";
    const next = buildDefaultDraftForLeague(normalizedLeague, profile?.team_scopes);
    const lineup = sharedMatchupLineupMap[getMatchupGraphicLineupKey(normalizedLeague, next.leftTeamId)];
    setDraft(lineup ? applyTeamLineupToDraftSide(next, "left", lineup) : next);
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
      : nextTab === TOOL_TABS.CUSTOM_REQUESTS
        ? TOOL_TABS.CUSTOM_REQUESTS
      : nextTab === TOOL_TABS.VISUAL_DRILL
        ? TOOL_TABS.VISUAL_DRILL
      : nextTab === TOOL_TABS.SCOUTING
        ? TOOL_TABS.SCOUTING
        : TOOL_TABS.GRAPHICS;
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", normalized);
    if (normalized === TOOL_TABS.GRAPHICS && !nextParams.get("graphic")) {
      nextParams.set("graphic", activeGraphic);
    }
    setParams(nextParams, { replace: true });
  };

  const handleGraphicTabChange = (nextGraphic) => {
    const normalized = [TOOL_TABS.PERSONNEL, TOOL_TABS.DEPTH_CHART].includes(nextGraphic)
      ? nextGraphic
      : TOOL_TABS.MATCHUP;
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", TOOL_TABS.GRAPHICS);
    nextParams.set("graphic", normalized);
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

  const handleRunCustomRequest = async () => {
    const prompt = String(customPrompt || "").trim();
    if (!prompt || customRequestLoading) return;

    setCustomRequestLoading(true);
    setCustomRequestError("");
    try {
      const result = await requestCustomDashboardRequest({ prompt });
      setCustomRequestResult(result);
    } catch (error) {
      console.error("Failed to run custom dashboard request.", error);
      setCustomRequestError(error?.message || "Unable to complete the custom request.");
    } finally {
      setCustomRequestLoading(false);
    }
  };

  const handleResetCustomRequest = () => {
    setCustomPrompt("");
    setCustomRequestError("");
    setCustomRequestResult(null);
  };

  const sortedRequestGroups = useMemo(() => {
    const groups = Array.isArray(customRequestResult?.result?.groups) ? customRequestResult.result.groups : [];
    if (!groups.length || customTableSort.table !== "groups" || !customTableSort.column) return groups;

    const direction = customTableSort.direction === "desc" ? -1 : 1;
    return [...groups].sort((left, right) => {
      const leftValue = customTableSort.column === "group"
        ? left.label
        : customTableSort.column === "value"
          ? left.displayValue
          : customTableSort.column === "games"
            ? left.sampleSize
            : customTableSort.column === "record"
              ? `${left.wins}-${left.losses}`
              : customTableSort.column === "avg"
                ? left.averageDisplayValue
                : left.totalDisplayValue;
      const rightValue = customTableSort.column === "group"
        ? right.label
        : customTableSort.column === "value"
          ? right.displayValue
          : customTableSort.column === "games"
            ? right.sampleSize
            : customTableSort.column === "record"
              ? `${right.wins}-${right.losses}`
              : customTableSort.column === "avg"
                ? right.averageDisplayValue
                : right.totalDisplayValue;
      const comparison = compareSortableValues(leftValue, rightValue);
      if (comparison !== 0) return comparison * direction;
      return String(left.label || "").localeCompare(String(right.label || ""));
    });
  }, [customRequestResult, customTableSort]);

  const sortedRequestTableRows = useMemo(() => {
    const rows = Array.isArray(customRequestResult?.result?.table?.rows) ? customRequestResult.result.table.rows : [];
    if (!rows.length || customTableSort.table !== "game-table" || !customTableSort.column) return rows;

    const direction = customTableSort.direction === "desc" ? -1 : 1;
    return [...rows].sort((left, right) => {
      const comparison = compareSortableValues(left.values?.[customTableSort.column], right.values?.[customTableSort.column]);
      if (comparison !== 0) return comparison * direction;
      return String(left.gameDate || "").localeCompare(String(right.gameDate || ""));
    });
  }, [customRequestResult, customTableSort]);

  const sortedRequestGames = useMemo(() => {
    const games = Array.isArray(customRequestResult?.result?.games) ? customRequestResult.result.games : [];
    if (!games.length || customTableSort.table !== "game-log" || !customTableSort.column) return games;

    const direction = customTableSort.direction === "desc" ? -1 : 1;
    return [...games].sort((left, right) => {
      const leftValue = customTableSort.column === "gameDate"
        ? left.gameDate
        : customTableSort.column === "opponent"
          ? left?.opponent?.tricode || left?.opponent?.fullName || "-"
          : customTableSort.column === "result"
            ? left.result || "-"
            : customTableSort.column === "score"
              ? `${left.teamScore}-${left.opponentScore}`
              : customTableSort.column === "value"
                ? left.value
                : left.gameId;
      const rightValue = customTableSort.column === "gameDate"
        ? right.gameDate
        : customTableSort.column === "opponent"
          ? right?.opponent?.tricode || right?.opponent?.fullName || "-"
          : customTableSort.column === "result"
            ? right.result || "-"
            : customTableSort.column === "score"
              ? `${right.teamScore}-${right.opponentScore}`
              : customTableSort.column === "value"
                ? right.value
                : right.gameId;
      const comparison = compareSortableValues(leftValue, rightValue);
      if (comparison !== 0) return comparison * direction;
      return String(left.gameDate || "").localeCompare(String(right.gameDate || ""));
    });
  }, [customRequestResult, customTableSort]);

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

  const handleRequestTableSort = (table, column) => {
    setCustomTableSort((current) => (
      current.table === table && current.column === column
        ? { table, column, direction: current.direction === "asc" ? "desc" : "asc" }
        : { table, column, direction: "asc" }
    ));
  };

  const sortIndicator = (table, column) => {
    if (customTableSort.table !== table || customTableSort.column !== column) return "";
    return customTableSort.direction === "asc" ? " ▲" : " ▼";
  };

  const handleSave = async () => {
    if (!vaultUserId) {
      setSaveStatus("Sign in to save this match-up graphic.");
      return;
    }
    if (busyAction) return;
    setBusyAction("save");
    const id = recordId || crypto.randomUUID();
    const timestamp = new Date().toISOString();

    try {
      const saveDraft = await migrateLegacyMatchupHeadshots(draft, user?.id);
      setDraft(saveDraft);
      const record = {
        id,
        type: "matchup_graphic",
        title: buildDraftTitle(saveDraft),
        updatedAt: timestamp,
        createdAt: timestamp,
        payload: serializeMatchupDraft(saveDraft),
      };
      const sharedLineupsToSave = [
        buildMatchupGraphicLineupFromDraft(saveDraft, "left", leftRoster),
        buildMatchupGraphicLineupFromDraft(saveDraft, "right", rightRoster),
      ].filter(Boolean);
      const savedRecord = accountsEnabled && user?.id
        ? await saveToolRecordRemote(user.id, record)
        : saveToolRecord(vaultUserId, record);
      if (!savedRecord) {
        setSaveStatus("Unable to save this draft. Try deleting older browser data or sign in again.");
        return;
      }
      let sharedLineupError = null;
      try {
        await saveRemoteMatchupGraphicLineups(sharedLineupsToSave);
        await queryClient.invalidateQueries({ queryKey: ["matchup-graphic-team-lineups"] });
      } catch (error) {
        sharedLineupError = error;
        console.error("Failed to save shared match-up player selections.", error);
      }
      await queryClient.invalidateQueries({ queryKey: ["owned-tools", vaultUserId] });
      setRecordId(savedRecord.id);
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", TOOL_TABS.GRAPHICS);
      nextParams.set("graphic", TOOL_TABS.MATCHUP);
      nextParams.set("draft", savedRecord.id);
      setParams(nextParams, { replace: true });
      setSaveStatus(sharedLineupError
        ? `Saved to My Vault as ${savedRecord.title}, but the shared player selections could not be updated. Try saving again.`
        : `Saved to My Vault as ${savedRecord.title}. Player selections are shared for the next user.`);
    } catch (error) {
      console.error("Failed to save match-up graphic draft.", error);
      setSaveStatus(error?.message || "Unable to save this draft to Supabase. It was not saved; try again.");
    } finally {
      setBusyAction("");
    }
  };

  const handleDelete = async () => {
    if (!vaultUserId || !recordId) return;
    const confirmed = window.confirm("Delete this saved match-up draft?");
    if (!confirmed) return;
    if (busyAction) return;
    setBusyAction("delete");
    try {
      if (accountsEnabled && user?.id) {
        await deleteSavedToolRecordRemote(user.id, recordId);
      } else {
        deleteSavedToolRecord(vaultUserId, recordId);
      }
      await queryClient.invalidateQueries({ queryKey: ["owned-tools", vaultUserId] });
      setRecordId("");
      setDraft(defaultDraft);
      const nextParams = new URLSearchParams(params);
      nextParams.delete("draft");
      setParams(nextParams, { replace: true });
      setSaveStatus("Deleted saved draft.");
    } catch (error) {
      console.error("Failed to delete remote match-up graphic draft.", error);
      setSaveStatus("Unable to delete this Supabase draft. It has not been removed; try again.");
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
    if (!vaultUserId || !scoutingResult || scoutingBusyAction || scoutingLoading) return;
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
      const savedRecord = accountsEnabled && user?.id
        ? await saveToolRecordRemote(user.id, record)
        : saveToolRecord(vaultUserId, record);
      if (!savedRecord) {
        setScoutingSaveStatus("Unable to save this packet. Try deleting older browser data or sign in again.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["owned-tools", vaultUserId] });
      setScoutingRecordId(savedRecord.id);
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", TOOL_TABS.SCOUTING);
      nextParams.set("packet", savedRecord.id);
      setParams(nextParams, { replace: true });
      setScoutingSaveStatus(`Saved to My Vault as ${savedRecord.title}`);
    } catch (error) {
      console.error("Failed to save scouting packet.", error);
      setScoutingSaveStatus("Unable to save this packet to Supabase. It was not saved; try again.");
    } finally {
      setScoutingBusyAction("");
    }
  };

  const handleDeleteScoutingPacket = async () => {
    if (!vaultUserId || !scoutingRecordId || scoutingBusyAction) return;
    const confirmed = window.confirm("Delete this saved scouting packet?");
    if (!confirmed) return;
    setScoutingBusyAction("delete");
    try {
      if (accountsEnabled && user?.id) {
        await deleteSavedToolRecordRemote(user.id, scoutingRecordId);
      } else {
        deleteSavedToolRecord(vaultUserId, scoutingRecordId);
      }
      await queryClient.invalidateQueries({ queryKey: ["owned-tools", vaultUserId] });
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
      console.error("Failed to delete remote scouting packet.", error);
      setScoutingSaveStatus("Unable to delete this Supabase packet. It has not been removed; try again.");
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
        <h1 className={styles.title}>Coaching Tools</h1>
      </section>

      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === TOOL_TABS.VISUAL_DRILL ? styles.tabButtonActive : ""}`}
          onClick={() => handleToolTabChange(TOOL_TABS.VISUAL_DRILL)}
        >
          Visual Drill
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === TOOL_TABS.GRAPHICS ? styles.tabButtonActive : ""}`}
          onClick={() => handleToolTabChange(TOOL_TABS.GRAPHICS)}
        >
          Graphics
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
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === TOOL_TABS.CUSTOM_REQUESTS ? styles.tabButtonActive : ""}`}
          onClick={() => handleToolTabChange(TOOL_TABS.CUSTOM_REQUESTS)}
        >
          Custom Requests
        </button>
      </div>

      {activeTab === TOOL_TABS.GRAPHICS ? (
        <div className={styles.graphicTabBar} aria-label="Graphic tools">
          <button
            type="button"
            className={`${styles.graphicTabButton} ${activeGraphic === TOOL_TABS.MATCHUP ? styles.graphicTabButtonActive : ""}`}
            onClick={() => handleGraphicTabChange(TOOL_TABS.MATCHUP)}
          >
            Match-Up
          </button>
          <button
            type="button"
            className={`${styles.graphicTabButton} ${activeGraphic === TOOL_TABS.PERSONNEL ? styles.graphicTabButtonActive : ""}`}
            onClick={() => handleGraphicTabChange(TOOL_TABS.PERSONNEL)}
          >
            Personnel
          </button>
          <button
            type="button"
            className={`${styles.graphicTabButton} ${activeGraphic === TOOL_TABS.DEPTH_CHART ? styles.graphicTabButtonActive : ""}`}
            onClick={() => handleGraphicTabChange(TOOL_TABS.DEPTH_CHART)}
          >
            Depth Chart
          </button>
        </div>
      ) : null}

      {activeTab === TOOL_TABS.GRAPHICS && activeGraphic === TOOL_TABS.MATCHUP ? (
        <section className={styles.workspace}>
          {!remoteRostersPayload?.teams && league === "gleague" ? (
            <p className={styles.statusNote}>
              Live G League rosters will appear here once the `gleague-rosters` Supabase function is deployed.
            </p>
          ) : null}
          {sharedMatchupLineupsError ? (
            <p className={styles.statusNote}>
              Shared saved player selections are temporarily unavailable. New selections can still be saved to your draft.
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
              customPlayers={draft.leftCustomPlayers}
              onTeamChange={(nextTeamId) => handleTeamChange("left", nextTeamId)}
              onPlayerChange={(index, nextPlayerId) => handlePlayerChange("left", index, nextPlayerId)}
              onCustomPlayerChange={(index, patch) => handleCustomPlayerChange("left", index, patch)}
              onCustomHeadshotChange={(index, file) => handleCustomHeadshotChange("left", index, file)}
            />

            <ToolColumn
              columnId="right"
              teamId={draft.rightTeamId}
              teams={availableTeams}
              playerIds={draft.rightPlayerIds}
              rosterMap={rosterMap}
              customPlayers={draft.rightCustomPlayers}
              onTeamChange={(nextTeamId) => handleTeamChange("right", nextTeamId)}
              onPlayerChange={(index, nextPlayerId) => handlePlayerChange("right", index, nextPlayerId)}
              onCustomPlayerChange={(index, patch) => handleCustomPlayerChange("right", index, patch)}
              onCustomHeadshotChange={(index, file) => handleCustomHeadshotChange("right", index, file)}
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

          {saveStatus ? (
            <div className={styles.statusNote}>
              {saveStatus}
              {recordId && saveStatus.startsWith("Saved") ? (
                <>
                  {" "}
                  <Link className={styles.inlineStatusLink} to="/me?tab=graphics">View in My Vault</Link>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : activeTab === TOOL_TABS.GRAPHICS && activeGraphic === TOOL_TABS.PERSONNEL ? (
        <section className={styles.workspace}>
          <PersonnelGraphicAdmin
            rosterSources={{ nba: nbaRosterMap, gleague: gLeagueRosterMap }}
            rosterMetadata={{
              nba: {
                fetchedAt: remoteNbaRostersPayload?.fetchedAt,
                season: remoteNbaRostersPayload?.season,
                cacheFallback: remoteNbaRostersPayload?.cacheFallback,
              },
              gleague: {
                fetchedAt: remoteGLeagueRostersPayload?.fetchedAt,
                season: remoteGLeagueRostersPayload?.season,
                cacheFallback: remoteGLeagueRostersPayload?.cacheFallback,
              },
            }}
          />
        </section>
      ) : activeTab === TOOL_TABS.VISUAL_DRILL ? (
        <section className={styles.workspace}>
          <VisualDrillGenerator />
        </section>
      ) : activeTab === TOOL_TABS.GRAPHICS && activeGraphic === TOOL_TABS.DEPTH_CHART ? (
        <section className={styles.workspace}>
          <DepthChartGraphicAdmin rosterSources={{ nba: nbaRosterMap, gleague: gLeagueRosterMap }} />
        </section>
      ) : activeTab === TOOL_TABS.SCOUTING ? (
        <section className={styles.workspace}>
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
      ) : activeTab === TOOL_TABS.CUSTOM_REQUESTS ? (
        <section className={styles.workspace}>
          <section className={styles.requestPanel}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Prompt</span>
              <textarea
                className={styles.requestTextarea}
                value={customPrompt}
                onChange={(event) => {
                  setCustomPrompt(event.target.value);
                  setCustomRequestError("");
                }}
                placeholder="How many games this season has Cleveland had 5 or more kills recorded in a single game?"
                rows={5}
              />
            </label>

            <div className={styles.actionCluster}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleResetCustomRequest}
                disabled={customRequestLoading}
              >
                Reset
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleRunCustomRequest}
                disabled={!String(customPrompt || "").trim() || customRequestLoading}
              >
                {customRequestLoading ? "Running..." : "Run Request"}
              </button>
            </div>

            {customRequestError ? <div className={styles.statusError}>{customRequestError}</div> : null}
          </section>

          {customRequestResult ? (
            <section className={styles.requestResult}>
              <div className={styles.requestResultHeader}>
                <div>
                  <div className={styles.scoutingEyebrow}>Custom Request</div>
                  <h2 className={styles.requestHeadline}>{customRequestResult?.result?.answer || "Result"}</h2>
                </div>
                <div className={styles.scoutingMeta}>
                  {customRequestResult?.team?.tricode || "NBA"} · {customRequestResult?.season || ""}
                </div>
              </div>

              <div className={styles.requestMetaGrid}>
                <div className={styles.requestMetaCard}>
                  <div className={styles.scoutingDetailTitle}>Parsed Stat</div>
                  <div>{customRequestResult?.stat?.label || "Unknown"}</div>
                </div>
                <div className={styles.requestMetaCard}>
                  <div className={styles.scoutingDetailTitle}>Filters</div>
                  <div>
                    {[
                      customRequestResult?.filters?.opponent?.tricode
                        ? `vs ${customRequestResult.filters.opponent.tricode}`
                        : null,
                      customRequestResult?.parsedQuery?.resultFilter && customRequestResult?.parsedQuery?.resultFilter !== "all"
                        ? `${customRequestResult.parsedQuery.resultFilter}s`
                        : "All results",
                      customRequestResult?.filters?.seasonScope && customRequestResult.filters.seasonScope !== "all"
                        ? customRequestResult.filters.seasonScope === "playoffs"
                          ? "playoffs"
                          : "regular season"
                        : null,
                      customRequestResult?.filters?.groupBy && customRequestResult.filters.groupBy !== "none"
                        ? `grouped by ${customRequestResult.filters.groupBy}`
                        : null,
                    ].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className={styles.requestMetaCard}>
                  <div className={styles.scoutingDetailTitle}>Aggregation</div>
                  <div>{String(customRequestResult?.result?.aggregation || "").replaceAll("_", " ")}</div>
                </div>
                <div className={styles.requestMetaCard}>
                  <div className={styles.scoutingDetailTitle}>Sample Size</div>
                  <div>{customRequestResult?.result?.sampleSize || 0} games</div>
                </div>
                <div className={styles.requestMetaCard}>
                  <div className={styles.scoutingDetailTitle}>Value</div>
                  <div>{customRequestResult?.result?.displayValue || "0"}</div>
                </div>
              </div>

              {Array.isArray(customRequestResult?.result?.groups) && customRequestResult.result.groups.length ? (
                <div className={styles.requestGamesWrap}>
                  <div className={styles.scoutingDetailTitle}>Grouped Summary</div>
                  <div className={styles.requestTableWrap}>
                    <table className={styles.requestTable}>
                      <thead>
                        <tr>
                          <th><button type="button" className={styles.tableSortButton} onClick={() => handleRequestTableSort("groups", "group")}>Group{sortIndicator("groups", "group")}</button></th>
                          <th><button type="button" className={styles.tableSortButton} onClick={() => handleRequestTableSort("groups", "value")}>Value{sortIndicator("groups", "value")}</button></th>
                          <th><button type="button" className={styles.tableSortButton} onClick={() => handleRequestTableSort("groups", "games")}>Games{sortIndicator("groups", "games")}</button></th>
                          <th><button type="button" className={styles.tableSortButton} onClick={() => handleRequestTableSort("groups", "record")}>Record{sortIndicator("groups", "record")}</button></th>
                          <th><button type="button" className={styles.tableSortButton} onClick={() => handleRequestTableSort("groups", "avg")}>Avg{sortIndicator("groups", "avg")}</button></th>
                          <th><button type="button" className={styles.tableSortButton} onClick={() => handleRequestTableSort("groups", "total")}>Total{sortIndicator("groups", "total")}</button></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRequestGroups.map((group) => (
                          <tr key={group.key}>
                            <td>{group.label}</td>
                            <td>{group.displayValue}</td>
                            <td>{group.sampleSize}</td>
                            <td>{Number.isFinite(Number(group.wins)) && Number.isFinite(Number(group.losses)) ? `${group.wins}-${group.losses}` : "-"}</td>
                            <td>{group.averageDisplayValue || "-"}</td>
                            <td>{group.totalDisplayValue || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {Array.isArray(customRequestResult?.result?.table?.columns) && Array.isArray(customRequestResult?.result?.table?.rows) ? (
                <div className={styles.requestGamesWrap}>
                  <div className={styles.scoutingDetailTitle}>Game Table</div>
                  <div className={styles.requestTableWrap}>
                    <table className={styles.requestTable}>
                      <thead>
                        <tr>
                          {customRequestResult.result.table.columns.map((column) => (
                            <th key={column.key}>
                              <button
                                type="button"
                                className={styles.tableSortButton}
                                onClick={() => handleRequestTableSort("game-table", column.key)}
                              >
                                {column.label}{sortIndicator("game-table", column.key)}
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRequestTableRows.map((row) => (
                          <tr key={`${row.gameId}-${row.gameDate}`}>
                            {customRequestResult.result.table.columns.map((column) => (
                              <td key={`${row.gameId}-${column.key}`}>{row.values?.[column.key] ?? "-"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : Array.isArray(customRequestResult?.result?.games) && customRequestResult.result.games.length ? (
                <div className={styles.requestGamesWrap}>
                  <div className={styles.scoutingDetailTitle}>Game Log</div>
                  <div className={styles.requestTableWrap}>
                    <table className={styles.requestTable}>
                      <thead>
                        <tr>
                          <th><button type="button" className={styles.tableSortButton} onClick={() => handleRequestTableSort("game-log", "gameDate")}>Date{sortIndicator("game-log", "gameDate")}</button></th>
                          <th><button type="button" className={styles.tableSortButton} onClick={() => handleRequestTableSort("game-log", "opponent")}>Opponent{sortIndicator("game-log", "opponent")}</button></th>
                          <th><button type="button" className={styles.tableSortButton} onClick={() => handleRequestTableSort("game-log", "result")}>Result{sortIndicator("game-log", "result")}</button></th>
                          <th><button type="button" className={styles.tableSortButton} onClick={() => handleRequestTableSort("game-log", "score")}>Score{sortIndicator("game-log", "score")}</button></th>
                          <th><button type="button" className={styles.tableSortButton} onClick={() => handleRequestTableSort("game-log", "value")}>Value{sortIndicator("game-log", "value")}</button></th>
                          <th><button type="button" className={styles.tableSortButton} onClick={() => handleRequestTableSort("game-log", "gameId")}>Game ID{sortIndicator("game-log", "gameId")}</button></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRequestGames.map((game) => (
                          <tr key={`${game.gameId}-${game.gameDate}`}>
                            <td>{game.gameDate}</td>
                            <td>{game?.opponent?.tricode || game?.opponent?.fullName || "-"}</td>
                            <td>{game.result || "-"}</td>
                            <td>{Number.isFinite(Number(game.teamScore)) && Number.isFinite(Number(game.opponentScore)) ? `${game.teamScore}-${game.opponentScore}` : "-"}</td>
                            <td>{Number.isFinite(Number(game.value)) ? Number(game.value).toFixed(Math.abs(Number(game.value) % 1) > 0 ? 1 : 0) : game.value}</td>
                            <td>{game.gameId}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </section>
      ) : (
        <section className={styles.workspace}>
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
