import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteDrawingRecord, deleteNoteRecord, listOwnedDrawings, listOwnedNotes } from "../accountData.js";
import { fetchCurrentGLeagueRosters, fetchCurrentNbaRosters, fetchGamesMetadataByIds } from "../api.js";
import { useAuth } from "../auth/useAuth.js";
import MatchupGraphicPreview from "../components/MatchupGraphicPreview.jsx";
import { GLEAGUE_TEAMS, getLeagueTeam, getNbaTeamRoster, NBA_TEAMS } from "../data/nbaTeams.js";
import {
  GRAPHIC_TOOL_TABS,
  TOOL_TABS,
  normalizeGraphicToolTab,
} from "../toolNavigation.js";
import {
  deleteSavedToolRecord,
  deleteSavedToolRecordRemote,
  listSavedToolRecords,
  listSavedToolRecordsRemote,
  TOOL_RECORD_TYPES,
} from "../toolVault.js";
import styles from "./UserContent.module.css";

const DEFAULT_NOTE_TAG_OPTIONS = [
  "Reminder",
  "Playcall",
  "Injury",
  "Good",
  "Bad",
  "Offense",
  "Defense",
  "Halftime",
  "Misc",
];

const EMPTY_MATCHUP_PLAYER_IDS = Array(5).fill("");
const CUSTOM_MATCHUP_PLAYER_VALUE = "__custom__";
const CURRENT_ROSTER_STALE_TIME_MS = 5 * 60 * 1000;

function formatTimestamp(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function formatClock(note) {
  if (note.minutes == null || note.seconds == null) return "--";
  return `${note.minutes}:${String(note.seconds).padStart(2, "0")}`;
}

function getClipUrl(note) {
  const clipUrl = note?.source_meta?.clip_url;
  return clipUrl ? String(clipUrl) : "";
}

function isWashingtonTeam(team) {
  const tricode = String(team?.teamTricode || "").toUpperCase();
  const name = `${team?.teamCity || ""} ${team?.teamName || ""}`.toLowerCase();
  return tricode === "WAS" || name.includes("washington") || name.includes("wizards");
}

function isCapitalCityTeam(team) {
  const tricode = String(team?.teamTricode || "").toUpperCase();
  const name = `${team?.teamCity || ""} ${team?.teamName || ""}`.toLowerCase();
  return tricode === "CCG" || name.includes("capital city") || name.includes("go-go") || name.includes("gogo");
}

function inferLeagueForTeam(team) {
  const teamId = Number(team?.teamId);
  if (teamId >= 1612700000 && teamId < 1612710000) return "gleague";
  return "nba";
}

function normalizeDateOnly(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function buildOpponentLabel(team) {
  const city = String(team?.teamCity || "").trim();
  const name = String(team?.teamName || "").trim();
  if (!city && !name) return "Unknown opponent";
  if (!city) return name;
  if (!name) return city;
  return `${city} ${name}`;
}

function buildGameMeta(game) {
  const away = game?.awayTeam;
  const home = game?.homeTeam;
  let trackedTeam = null;
  let opponentTeam = null;

  if (isWashingtonTeam(away)) {
    trackedTeam = away;
    opponentTeam = home;
  } else if (isWashingtonTeam(home)) {
    trackedTeam = home;
    opponentTeam = away;
  } else if (isCapitalCityTeam(away)) {
    trackedTeam = away;
    opponentTeam = home;
  } else if (isCapitalCityTeam(home)) {
    trackedTeam = home;
    opponentTeam = away;
  }

  const gameDate = normalizeDateOnly(game?.gameEt || game?.gameTimeUTC || game?.gameDate);
  const opponentLabel = opponentTeam ? buildOpponentLabel(opponentTeam) : "Unknown opponent";
  const opponentLeague = opponentTeam ? inferLeagueForTeam(opponentTeam) : "nba";
  const trackedLabel = trackedTeam ? buildOpponentLabel(trackedTeam) : "";
  return {
    gameDate,
    opponentLabel,
    opponentLeague,
    opponentKey: opponentTeam ? `${opponentLeague}:${opponentTeam.teamId || opponentLabel}` : "",
    trackedLabel,
  };
}

function getSavedGraphicPresentation(toolRecord) {
  if (toolRecord.type === TOOL_RECORD_TYPES.COVERAGE_GRAPHIC) {
    const league = String(toolRecord.payload?.league || "nba").trim() === "gleague" ? "gleague" : "nba";
    const team = getLeagueTeam(toolRecord.payload?.logoTeamId, league);
    const slotCount = Array.isArray(toolRecord.payload?.slots)
      ? toolRecord.payload.slots.filter((slot) => (
        String(slot?.title || slot?.subtitle || slot?.iconKey || "").trim()
      )).length
      : 0;
    return {
      meta: "Coverage Graphic · Saved draft",
      body: `${team?.fullName || "Coverage graphic"}${slotCount ? ` · ${slotCount} spaces filled` : ""}`,
      link: `/graphics?graphic=coverage&coverage=${encodeURIComponent(toolRecord.id)}`,
    };
  }
  if (toolRecord.type === TOOL_RECORD_TYPES.PREGAME_COURT_TIME_GRAPHIC) {
    const opponentLine = String(toolRecord.payload?.opponentLine || "").trim();
    const slotCount = Array.isArray(toolRecord.payload?.slots) ? toolRecord.payload.slots.length : 0;
    return {
      meta: "Court Time Graphic · Saved draft",
      body: `${opponentLine || "Court Time graphic"}${slotCount ? ` · ${slotCount} slots` : ""}`,
      link: `/graphics?graphic=court-time&courtTime=${encodeURIComponent(toolRecord.id)}`,
    };
  }
  if (toolRecord.type === TOOL_RECORD_TYPES.PERSONNEL_GRAPHIC) {
    const league = toolRecord.payload?.league === "gleague" ? "gleague" : "nba";
    const team = getLeagueTeam(toolRecord.payload?.teamId, league);
    const playerCount = Array.isArray(toolRecord.payload?.rows)
      ? toolRecord.payload.rows.filter((row) => String(row?.personId || row?.playerId || "").trim()).length
      : 0;
    return {
      meta: "Personnel Graphic · Saved draft",
      body: `${team?.fullName || `${league === "gleague" ? "G League" : "NBA"} personnel draft`}${playerCount ? ` · ${playerCount} players` : ""}`,
      link: `/graphics?graphic=personnel&personnel=${encodeURIComponent(toolRecord.id)}`,
    };
  }
  if (toolRecord.type === TOOL_RECORD_TYPES.DEPTH_CHART_GRAPHIC) {
    const league = String(toolRecord.payload?.league || "nba").trim() === "gleague" ? "gleague" : "nba";
    const team = getLeagueTeam(toolRecord.payload?.teamId, league);
    const selectedSlots = Array.isArray(toolRecord.payload?.slots)
      ? toolRecord.payload.slots.filter((slot) => String(slot?.selection || slot?.customLastName || "").trim()).length
      : 0;
    return {
      meta: "Depth Chart Graphic · Saved draft",
      body: `${team?.fullName || (league === "gleague" ? "G League depth chart" : "NBA depth chart")}${selectedSlots ? ` · ${selectedSlots} slots filled` : ""}`,
      link: `/graphics?graphic=depth-chart&depthChart=${encodeURIComponent(toolRecord.id)}`,
    };
  }
  const league = String(toolRecord.payload?.league || "nba").trim() === "gleague" ? "gleague" : "nba";
  const leftTeam = getLeagueTeam(toolRecord.payload?.leftTeamId, league);
  const rightTeam = getLeagueTeam(toolRecord.payload?.rightTeamId, league);
  return {
    meta: "Match-Up Graphic · Saved draft",
    body: leftTeam || rightTeam
      ? `${leftTeam?.fullName || "Left side empty"} vs ${rightTeam?.fullName || "Right side empty"}`
      : "Saved match-up graphic.",
    link: `/graphics?graphic=matchup&draft=${encodeURIComponent(toolRecord.id)}`,
  };
}

function normalizeRosterPlayer(player, fallbackTeamId) {
  return {
    personId: String(player?.personId || "").trim(),
    firstName: String(player?.firstName || "").trim(),
    familyName: String(player?.familyName || "").trim(),
    fullName: String(player?.fullName || "").trim(),
    jerseyNum: String(player?.jerseyNum || "").trim(),
    teamId: String(player?.teamId || fallbackTeamId || "").trim(),
  };
}

function buildRosterMapFromPayload(payload, teams, fallbackRosterForTeam = null) {
  const remoteTeams = payload?.teams && typeof payload.teams === "object" ? payload.teams : {};
  const next = {};
  teams.forEach((team) => {
    const remoteRoster = Array.isArray(remoteTeams?.[team.teamId]?.players)
      ? remoteTeams[team.teamId].players
        .map((player) => normalizeRosterPlayer(player, team.teamId))
        .filter((player) => player.personId && player.fullName)
      : [];
    const fallbackRoster = fallbackRosterForTeam ? fallbackRosterForTeam(team.teamId) : [];
    next[team.teamId] = remoteRoster.length ? remoteRoster : fallbackRoster;
  });
  return next;
}

function buildCustomMatchupPreviewPlayer(customPlayer, index, teamId) {
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

function resolveMatchupPreviewPlayers(playerIds, roster, customPlayers, teamId) {
  const playersById = new Map((roster || []).map((player) => [String(player.personId), player]));
  return EMPTY_MATCHUP_PLAYER_IDS.map((_, index) => {
    const playerId = String(playerIds?.[index] || "").trim();
    if (playerId === CUSTOM_MATCHUP_PLAYER_VALUE) {
      return buildCustomMatchupPreviewPlayer(customPlayers?.[index], index, teamId);
    }
    return playersById.get(playerId) || null;
  });
}

function SavedMatchupGraphicPreview({ toolRecord, nbaRosterMap, gLeagueRosterMap }) {
  const payload = toolRecord.payload && typeof toolRecord.payload === "object" ? toolRecord.payload : {};
  const league = String(payload.league || "nba").trim() === "gleague" ? "gleague" : "nba";
  const rosterMap = league === "gleague" ? gLeagueRosterMap : nbaRosterMap;
  const leftTeam = getLeagueTeam(payload.leftTeamId, league);
  const rightTeam = getLeagueTeam(payload.rightTeamId, league);
  const leftPlayers = resolveMatchupPreviewPlayers(
    payload.leftPlayerIds,
    rosterMap[String(payload.leftTeamId || "")] || [],
    payload.leftCustomPlayers,
    payload.leftTeamId
  );
  const rightPlayers = resolveMatchupPreviewPlayers(
    payload.rightPlayerIds,
    rosterMap[String(payload.rightTeamId || "")] || [],
    payload.rightCustomPlayers,
    payload.rightTeamId
  );
  const isReady = Boolean(
    leftTeam &&
    rightTeam &&
    String(payload.logoTeamId || "").trim() &&
    leftPlayers.every(Boolean) &&
    rightPlayers.every(Boolean)
  );

  return (
    <MatchupGraphicPreview
      className={styles.savedGraphicPreview}
      canvasClassName={styles.savedGraphicPreviewCanvas}
      statusClassName={styles.previewStatus}
      league={league}
      leftPlayers={leftPlayers}
      rightPlayers={rightPlayers}
      logoTeamId={payload.logoTeamId}
      isReady={isReady}
      unavailableMessage="Preview unavailable until this saved draft has both teams, ten players, and a logo."
      previewWidth={640}
      previewHeight={360}
      lazy
    />
  );
}

function SavedGraphicArea({ title, records, deletingKey, onDelete, renderPreview }) {
  return (
    <section className={styles.graphicsArea}>
      <div className={styles.graphicsAreaHeader}>
        <h2>{title}</h2>
        <span>{records.length} saved</span>
      </div>
      {records.length ? (
        <div className={styles.list}>
          {records.map((toolRecord) => {
            const presentation = getSavedGraphicPresentation(toolRecord);
            const isDeleting = deletingKey === `tool:${toolRecord.id}`;
            return (
              <article key={toolRecord.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitleGroup}>
                    <div className={styles.cardTitle}>{toolRecord.title || "Untitled"}</div>
                    {!renderPreview ? <div className={styles.cardMeta}>{presentation.meta}</div> : null}
                  </div>
                  <div className={styles.cardActions}>
                    <Link className={styles.cardLink} to={presentation.link}>Open Graphic</Link>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => onDelete(toolRecord)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
                {renderPreview ? renderPreview(toolRecord) : <div className={styles.cardBody}>{presentation.body}</div>}
                <div className={styles.cardFooter}>Updated {formatTimestamp(toolRecord.updatedAt)}</div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyState}>No saved {title.toLowerCase()} yet.</div>
      )}
    </section>
  );
}

export default function UserContent() {
  const { user, profile, hasFeature, accountsEnabled, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const canUseTools = !accountsEnabled || hasFeature("tools");
  const canUseAdminTools = !accountsEnabled || isAdmin;
  const vaultUserId = user?.id || (!accountsEnabled ? "guest" : "");
  const rawTab = params.get("tab");
  const tab = rawTab === "drawings"
    ? "drawings"
    : rawTab === "graphics" && canUseTools
      ? "graphics"
    : rawTab === "rotations" && canUseTools
      ? "rotations"
    : rawTab === "late-game" && canUseTools && canUseAdminTools
      ? "late-game"
      : rawTab === "tools" && canUseTools
        ? "tools"
      : canUseTools
        ? "graphics"
        : "notes";
  const rawGraphic = String(params.get("graphic") || "").trim();
  const activeGraphicTab = normalizeGraphicToolTab(rawGraphic);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [opponentFilter, setOpponentFilter] = useState("all");
  const [tagFilters, setTagFilters] = useState([]);
  const [deletingKey, setDeletingKey] = useState("");
  const [toolExportStatus, setToolExportStatus] = useState("");
  const [toolVaultStatus, setToolVaultStatus] = useState("");

  const { data: notes = [], isLoading: loadingNotes } = useQuery({
    queryKey: ["owned-notes", user?.id],
    queryFn: () => listOwnedNotes(user.id),
    enabled: Boolean(user?.id && tab === "notes"),
  });

  const { data: drawings = [], isLoading: loadingDrawings } = useQuery({
    queryKey: ["owned-drawings", user?.id],
    queryFn: () => listOwnedDrawings(user.id),
    enabled: Boolean(user?.id && tab === "drawings"),
  });

  const { data: savedTools = [] } = useQuery({
    queryKey: ["owned-tools", vaultUserId],
    enabled: Boolean(vaultUserId && canUseTools && ["graphics", "rotations", "tools", "late-game"].includes(tab)),
    queryFn: async () => {
      if (!vaultUserId || !canUseTools) return [];
      if (!accountsEnabled || !user?.id) return listSavedToolRecords(vaultUserId);
      try {
        return await listSavedToolRecordsRemote(user.id);
      } catch (error) {
        console.error("Failed to load remote tool drafts, falling back to local storage.", error);
        return listSavedToolRecords(vaultUserId);
      }
    },
  });

  const uniqueGameIds = useMemo(() => (
    Array.from(
      new Set(
        (tab === "notes" ? notes : tab === "drawings" ? drawings : [])
          .map((item) => String(item?.game_id || "").trim())
          .filter(Boolean)
      )
    )
  ), [drawings, notes, tab]);

  const { data: gamesById = {} } = useQuery({
    queryKey: ["vault-game-metadata", uniqueGameIds],
    queryFn: () => fetchGamesMetadataByIds(uniqueGameIds),
    enabled: Boolean(user?.id && uniqueGameIds.length && ["notes", "drawings"].includes(tab)),
    staleTime: 5 * 60 * 1000,
  });

  const gameMetaById = useMemo(() => {
    const next = new Map();
    uniqueGameIds.forEach((gameId) => {
      if (gamesById?.[gameId]) next.set(gameId, buildGameMeta(gamesById[gameId]));
    });
    return next;
  }, [gamesById, uniqueGameIds]);

  const opponentOptions = useMemo(() => {
    const map = new Map();
    gameMetaById.forEach((meta) => {
      if (!meta.opponentKey) return;
      if (!map.has(meta.opponentKey)) {
        map.set(meta.opponentKey, {
          key: meta.opponentKey,
          label: meta.opponentLabel,
          league: meta.opponentLeague,
        });
      }
    });
    return {
      nba: [...map.values()].filter((option) => option.league === "nba").sort((a, b) => a.label.localeCompare(b.label)),
      gleague: [...map.values()].filter((option) => option.league === "gleague").sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [gameMetaById]);

  const availableTagOptions = useMemo(() => {
    const extras = new Set();
    notes.forEach((note) => {
      const tags = Array.isArray(note?.tags) ? note.tags : [];
      tags.forEach((tag) => {
        const normalized = String(tag || "").trim();
        if (normalized) {
          extras.add(normalized);
        }
      });
    });
    return [
      ...DEFAULT_NOTE_TAG_OPTIONS.filter((tag) => extras.delete(tag) || true),
      ...[...extras].sort((a, b) => a.localeCompare(b)),
    ];
  }, [notes]);

  const itemMatchesBaseFilters = (item) => {
    if (!fromDate && !toDate && opponentFilter === "all") return true;
    const meta = gameMetaById.get(String(item?.game_id || "").trim());
    if (!meta) return false;
    if (fromDate && (!meta.gameDate || meta.gameDate < fromDate)) return false;
    if (toDate && (!meta.gameDate || meta.gameDate > toDate)) return false;
    if (opponentFilter !== "all" && meta.opponentKey !== opponentFilter) return false;
    return true;
  };

  const filteredNotes = useMemo(() => (
    notes.filter((note) => {
      if (!itemMatchesBaseFilters(note)) return false;
      if (!tagFilters.length) return true;
      const noteTags = Array.isArray(note?.tags) ? note.tags : [];
      return tagFilters.some((tag) => noteTags.includes(tag));
    })
  ), [notes, fromDate, toDate, opponentFilter, gameMetaById, tagFilters]);
  const filteredDrawings = useMemo(
    () => drawings.filter((drawing) => {
      if (!drawing.game_id && (fromDate || toDate || opponentFilter !== "all")) {
        return false;
      }
      return itemMatchesBaseFilters(drawing);
    }),
    [drawings, fromDate, toDate, opponentFilter, gameMetaById]
  );
  const matchupToolRecords = useMemo(
    () => savedTools.filter((record) => record.type === TOOL_RECORD_TYPES.MATCHUP_GRAPHIC),
    [savedTools]
  );
  const matchupPreviewLeagueNeeds = useMemo(() => {
    const needs = { nba: false, gleague: false };
    matchupToolRecords.forEach((record) => {
      const league = String(record?.payload?.league || "nba").trim() === "gleague" ? "gleague" : "nba";
      needs[league] = true;
    });
    return needs;
  }, [matchupToolRecords]);
  const nbaMatchupPreviewTeamIds = useMemo(() => {
    const teamIds = new Set();
    matchupToolRecords.forEach((record) => {
      const league = String(record?.payload?.league || "nba").trim() === "gleague" ? "gleague" : "nba";
      if (league !== "nba") return;
      [record?.payload?.leftTeamId, record?.payload?.rightTeamId].forEach((teamId) => {
        const safeTeamId = String(teamId || "").trim();
        if (safeTeamId) teamIds.add(safeTeamId);
      });
    });
    return [...teamIds];
  }, [matchupToolRecords]);
  const shouldLoadMatchupPreviewRosters = Boolean(
    vaultUserId &&
    canUseTools &&
    tab === "graphics" &&
    activeGraphicTab === TOOL_TABS.MATCHUP &&
    matchupToolRecords.length
  );

  const { data: remoteNbaRostersPayload } = useQuery({
    queryKey: ["vault-current-nba-rosters", nbaMatchupPreviewTeamIds],
    queryFn: ({ signal }) => fetchCurrentNbaRosters({ teamIds: nbaMatchupPreviewTeamIds, signal }),
    enabled: shouldLoadMatchupPreviewRosters && matchupPreviewLeagueNeeds.nba,
    staleTime: CURRENT_ROSTER_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });

  const { data: remoteGLeagueRostersPayload } = useQuery({
    queryKey: ["vault-current-gleague-rosters"],
    queryFn: ({ signal }) => fetchCurrentGLeagueRosters({ signal }),
    enabled: shouldLoadMatchupPreviewRosters && matchupPreviewLeagueNeeds.gleague,
    staleTime: CURRENT_ROSTER_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });
  const vaultNbaRosterMap = useMemo(
    () => buildRosterMapFromPayload(remoteNbaRostersPayload, NBA_TEAMS, getNbaTeamRoster),
    [remoteNbaRostersPayload]
  );
  const vaultGLeagueRosterMap = useMemo(
    () => buildRosterMapFromPayload(remoteGLeagueRostersPayload, GLEAGUE_TEAMS),
    [remoteGLeagueRostersPayload]
  );
  const personnelToolRecords = useMemo(
    () => savedTools.filter((record) => record.type === TOOL_RECORD_TYPES.PERSONNEL_GRAPHIC),
    [savedTools]
  );
  const courtTimeToolRecords = useMemo(
    () => savedTools.filter((record) => record.type === TOOL_RECORD_TYPES.PREGAME_COURT_TIME_GRAPHIC),
    [savedTools]
  );
  const coverageToolRecords = useMemo(
    () => savedTools.filter((record) => record.type === TOOL_RECORD_TYPES.COVERAGE_GRAPHIC),
    [savedTools]
  );
  const depthChartToolRecords = useMemo(
    () => savedTools.filter((record) => record.type === TOOL_RECORD_TYPES.DEPTH_CHART_GRAPHIC),
    [savedTools]
  );
  const rotationToolRecords = useMemo(
    () => savedTools.filter((record) => record.type === TOOL_RECORD_TYPES.ROTATIONS_TOOL),
    [savedTools]
  );
  const analysisToolRecords = useMemo(
    () => savedTools.filter((record) => record.type === TOOL_RECORD_TYPES.GAME_ANALYSIS),
    [savedTools]
  );
  const scoutingToolRecords = useMemo(
    () => savedTools.filter((record) => record.type === TOOL_RECORD_TYPES.PREGAME_SCOUTING_PACKET),
    [savedTools]
  );
  const visualDrillPresetRecords = useMemo(
    () => savedTools.filter((record) => record.type === TOOL_RECORD_TYPES.VISUAL_DRILL_PRESET),
    [savedTools]
  );
  const lateGameFeedbackRecords = useMemo(
    () => savedTools.filter((record) => record.type === TOOL_RECORD_TYPES.LATE_GAME_FEEDBACK),
    [savedTools]
  );

  const tagSummaryLabel = useMemo(() => {
    if (!tagFilters.length) return "All Tags";
    if (tagFilters.length === 1) return tagFilters[0];
    return `${tagFilters.length} Tags`;
  }, [tagFilters]);

  const setTab = (nextTab) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", nextTab);
    if (nextTab === TOOL_TABS.GRAPHICS) {
      nextParams.set("graphic", activeGraphicTab);
    } else {
      nextParams.delete("graphic");
    }
    setParams(nextParams, { replace: true });
  };

  const setGraphicTab = (nextGraphicTab) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", TOOL_TABS.GRAPHICS);
    nextParams.set("graphic", nextGraphicTab);
    setParams(nextParams, { replace: true });
  };

  const handleDeleteNote = async (note) => {
    if (!user?.id) return;
    const confirmed = window.confirm("Delete this saved note?");
    if (!confirmed) return;
    const key = `note:${note.id}`;
    try {
      setDeletingKey(key);
      await deleteNoteRecord(note.id, user.id);
      await queryClient.invalidateQueries({ queryKey: ["owned-notes", user.id] });
      await queryClient.invalidateQueries({ queryKey: ["notes"] });
    } finally {
      setDeletingKey("");
    }
  };

  const handleDeleteDrawing = async (drawing) => {
    if (!user?.id) return;
    const confirmed = window.confirm(`Delete "${drawing.title || "Untitled"}"?`);
    if (!confirmed) return;
    const key = `drawing:${drawing.id}`;
    try {
      setDeletingKey(key);
      await deleteDrawingRecord(drawing.id, user.id);
      await queryClient.invalidateQueries({ queryKey: ["owned-drawings", user.id] });
      await queryClient.invalidateQueries({ queryKey: ["drawings"] });
    } finally {
      setDeletingKey("");
    }
  };

  const handleDeleteTool = async (toolRecord) => {
    if (!vaultUserId) return;
    const confirmed = window.confirm(`Delete "${toolRecord.title || "Untitled"}"?`);
    if (!confirmed) return;
    const key = `tool:${toolRecord.id}`;
    try {
      setDeletingKey(key);
      if (accountsEnabled && user?.id) {
        await deleteSavedToolRecordRemote(user.id, toolRecord.id);
      } else {
        deleteSavedToolRecord(vaultUserId, toolRecord.id);
      }
      await queryClient.invalidateQueries({ queryKey: ["owned-tools", vaultUserId] });
      setToolVaultStatus(`Deleted "${toolRecord.title || "Untitled"}".`);
    } catch (error) {
      console.error("Failed to delete remote tool draft.", error);
      setToolVaultStatus("Unable to delete this Supabase record. It has not been removed; try again.");
    } finally {
      setDeletingKey("");
    }
  };

  const exportLateGameFeedback = async () => {
    if (!lateGameFeedbackRecords.length) {
      setToolExportStatus("No late-game feedback records to export.");
      return;
    }

    const payload = lateGameFeedbackRecords.map((record) => {
      const data = record.payload && typeof record.payload === "object" ? record.payload : {};
      return {
        title: record.title,
        updatedAt: record.updatedAt,
        gameId: data.gameId || "",
        verdict: data.verdict || "",
        suggestedCall: data.suggestedCall || "",
        notes: data.notes || "",
        tags: Array.isArray(data.tags) ? data.tags : [],
        strategyState: data.strategyState || {},
        strategyEvaluation: data.strategyEvaluation || {},
      };
    });

    const text = JSON.stringify(payload, null, 2);

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setToolExportStatus(`Copied ${payload.length} feedback record${payload.length === 1 ? "" : "s"} to clipboard.`);
        return;
      }
    } catch {
      // Fall through to file download.
    }

    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `late-game-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setToolExportStatus(`Exported ${payload.length} feedback record${payload.length === 1 ? "" : "s"} as JSON.`);
  };

  const toggleTagFilter = (tag) => {
    setTagFilters((current) => (
      current.includes(tag)
        ? current.filter((value) => value !== tag)
        : [...current, tag]
    ));
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <div className={styles.kicker}>My Vault</div>
          <h1 className={styles.title}>{profile?.display_name || profile?.email || "My Saved Content"}</h1>
        </div>
      </section>

      <div className={styles.tabRow}>
        {canUseTools ? (
          <button
            type="button"
            className={`${styles.tabButton} ${tab === "graphics" ? styles.tabButtonActive : ""}`}
            onClick={() => setTab("graphics")}
          >
            Graphics
          </button>
        ) : null}
        {canUseTools ? (
          <button
            type="button"
            className={`${styles.tabButton} ${tab === "rotations" ? styles.tabButtonActive : ""}`}
            onClick={() => setTab("rotations")}
          >
            Rotations
          </button>
        ) : null}
        <button
          type="button"
          className={`${styles.tabButton} ${tab === "notes" ? styles.tabButtonActive : ""}`}
          onClick={() => setTab("notes")}
        >
          Notes
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${tab === "drawings" ? styles.tabButtonActive : ""}`}
          onClick={() => setTab("drawings")}
        >
          Court Drawings
        </button>
        {canUseTools ? (
          <button
            type="button"
            className={`${styles.tabButton} ${tab === "tools" ? styles.tabButtonActive : ""}`}
            onClick={() => setTab("tools")}
          >
            Tools
          </button>
        ) : null}
        {canUseTools && canUseAdminTools ? (
          <button
            type="button"
            className={`${styles.tabButton} ${tab === "late-game" ? styles.tabButtonActive : ""}`}
            onClick={() => setTab("late-game")}
          >
            Late Game Analysis
          </button>
        ) : null}
      </div>

      {tab === "graphics" || tab === "rotations" || tab === "tools" || tab === "late-game" ? null : (
        <section className={styles.filterPanel}>
        <div className={styles.filterGrid}>
          <label className={styles.filterField}>
            <span>From Date</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>To Date</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>Opponent</span>
            <select value={opponentFilter} onChange={(event) => setOpponentFilter(event.target.value)}>
              <option value="all">All Opponents</option>
              {opponentOptions.nba.length ? (
                <optgroup label="NBA">
                  {opponentOptions.nba.map((option) => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </optgroup>
              ) : null}
              {opponentOptions.gleague.length ? (
                <optgroup label="G League">
                  {opponentOptions.gleague.map((option) => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
          {tab === "notes" && availableTagOptions.length ? (
            <div className={styles.filterField}>
              <span>Tag</span>
              <details className={styles.tagFilterMenu}>
                <summary>{tagSummaryLabel}</summary>
                <div className={styles.tagFilterOptions}>
                  {availableTagOptions.map((tag) => (
                    <label key={tag} className={styles.tagFilterOption}>
                      <input
                        type="checkbox"
                        checked={tagFilters.includes(tag)}
                        onChange={() => toggleTagFilter(tag)}
                      />
                      <span>{tag}</span>
                    </label>
                  ))}
                </div>
              </details>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={styles.clearFiltersButton}
          onClick={() => {
            setFromDate("");
            setToDate("");
            setOpponentFilter("all");
            setTagFilters([]);
          }}
        >
          Clear Filters
        </button>
        </section>
      )}

      {tab === "notes" ? (
        <section className={styles.section}>
          {loadingNotes ? (
            <div className={styles.emptyState}>Loading notes...</div>
          ) : filteredNotes.length === 0 ? (
            <div className={styles.emptyState}>You have not saved any notes yet.</div>
          ) : (
            <div className={styles.list}>
              {filteredNotes.map((note) => {
                const meta = gameMetaById.get(String(note.game_id || "").trim());
                const isDeleting = deletingKey === `note:${note.id}`;
                const clipUrl = getClipUrl(note);
                return (
                  <article key={note.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitleGroup}>
                        <div className={styles.cardTitle}>{meta?.opponentLabel || `Game ${note.game_id}`}</div>
                        <div className={styles.cardMeta}>
                          {meta?.gameDate || "Unknown date"} · {note.period_label || "--"} · {formatClock(note)} · {note.sharing_scope}
                        </div>
                      </div>
                      <div className={styles.cardActions}>
                        {clipUrl ? (
                          <a
                            className={styles.clipLink}
                            href={clipUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open play clip"
                            title="Open play clip"
                          >
                            <span className={styles.playIcon} aria-hidden="true" />
                          </a>
                        ) : null}
                        <Link className={styles.cardLink} to={`/g/${note.game_id}/notes`}>
                          Open Notes
                        </Link>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => handleDeleteNote(note)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                    <div className={styles.cardBody}>{note.text || "—"}</div>
                    {Array.isArray(note.tags) && note.tags.length ? (
                      <div className={styles.tagRow}>
                        {note.tags.map((tag) => (
                          <span key={tag} className={styles.tagChip}>{tag}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className={styles.cardFooter}>Updated {formatTimestamp(note.updated_at)}</div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : tab === "drawings" ? (
        <section className={styles.section}>
          {loadingDrawings ? (
            <div className={styles.emptyState}>Loading drawings...</div>
          ) : filteredDrawings.length === 0 ? (
            <div className={styles.emptyState}>You have not saved any court drawings yet.</div>
          ) : (
            <div className={styles.list}>
              {filteredDrawings.map((drawing) => {
                const meta = gameMetaById.get(String(drawing.game_id || "").trim());
                const isDeleting = deletingKey === `drawing:${drawing.id}`;
                return (
                  <article key={drawing.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitleGroup}>
                        <div className={styles.cardTitle}>{drawing.title || "Untitled"}</div>
                        <div className={styles.cardMeta}>
                          {drawing.game_id
                            ? `${meta?.opponentLabel || `Game ${drawing.game_id}`} · ${meta?.gameDate || "Unknown date"}`
                            : "General"}
                          {" · "}
                          {drawing.court_mode} court · {drawing.sharing_scope}
                        </div>
                      </div>
                      <div className={styles.cardActions}>
                        <Link
                          className={styles.cardLink}
                          to={`/draw?${new URLSearchParams({
                            ...(drawing.game_id ? { gameId: drawing.game_id } : {}),
                            boardId: drawing.id,
                            back: "/me?tab=drawings",
                          }).toString()}`}
                        >
                          Open Board
                        </Link>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => handleDeleteDrawing(drawing)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                    <div className={styles.cardBody}>
                      Saved board
                    </div>
                    <div className={styles.cardFooter}>Updated {formatTimestamp(drawing.updated_at)}</div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : tab === "graphics" ? (
        <section className={styles.graphicsVault}>
          {toolVaultStatus ? <div className={styles.toolToolbarStatus}>{toolVaultStatus}</div> : null}
          <div className={styles.graphicTabBar} aria-label="Saved graphic tools">
            {GRAPHIC_TOOL_TABS.map((graphicTab) => (
              <button
                key={graphicTab.key}
                type="button"
                className={`${styles.graphicTabButton} ${activeGraphicTab === graphicTab.key ? styles.graphicTabButtonActive : ""}`}
                onClick={() => setGraphicTab(graphicTab.key)}
              >
                {graphicTab.label}
              </button>
            ))}
          </div>
          {activeGraphicTab === TOOL_TABS.COURT_TIME ? (
            <SavedGraphicArea
              title="Court Time Graphics"
              records={courtTimeToolRecords}
              deletingKey={deletingKey}
              onDelete={handleDeleteTool}
            />
          ) : activeGraphicTab === TOOL_TABS.COVERAGE ? (
            <SavedGraphicArea
              title="Coverage Graphics"
              records={coverageToolRecords}
              deletingKey={deletingKey}
              onDelete={handleDeleteTool}
            />
          ) : activeGraphicTab === TOOL_TABS.PERSONNEL ? (
            <SavedGraphicArea
              title="Personnel Graphics"
              records={personnelToolRecords}
              deletingKey={deletingKey}
              onDelete={handleDeleteTool}
            />
          ) : activeGraphicTab === TOOL_TABS.DEPTH_CHART ? (
            <SavedGraphicArea
              title="Depth Chart Graphics"
              records={depthChartToolRecords}
              deletingKey={deletingKey}
              onDelete={handleDeleteTool}
            />
          ) : (
            <SavedGraphicArea
              title="Match-Up Graphics"
              records={matchupToolRecords}
              deletingKey={deletingKey}
              onDelete={handleDeleteTool}
              renderPreview={(toolRecord) => (
                <SavedMatchupGraphicPreview
                  toolRecord={toolRecord}
                  nbaRosterMap={vaultNbaRosterMap}
                  gLeagueRosterMap={vaultGLeagueRosterMap}
                />
              )}
            />
          )}
        </section>
      ) : tab === "rotations" ? (
        <section className={styles.section}>
          {toolVaultStatus ? <div className={styles.toolToolbarStatus}>{toolVaultStatus}</div> : null}
          {rotationToolRecords.length === 0 ? (
            <div className={styles.emptyState}>You have not saved any rotations yet.</div>
          ) : (
            <div className={styles.list}>
              {rotationToolRecords.map((toolRecord) => {
                const isDeleting = deletingKey === `tool:${toolRecord.id}`;
                const payload = toolRecord.payload && typeof toolRecord.payload === "object" ? toolRecord.payload : {};
                const opponentLine = String(payload.opponentLine || "").trim();
                const versionCount = Array.isArray(payload.gameState?.versions) ? payload.gameState.versions.length : 0;
                const lineupCount = Array.isArray(payload.savedLineups) ? payload.savedLineups.length : 0;
                return (
                  <article key={toolRecord.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitleGroup}>
                        <div className={styles.cardTitle}>{toolRecord.title || "Untitled"}</div>
                        <div className={styles.cardMeta}>Rotations · Saved draft</div>
                      </div>
                      <div className={styles.cardActions}>
                        <Link className={styles.cardLink} to={`/tools?tab=rotations&rotation=${encodeURIComponent(toolRecord.id)}`}>
                          Open Tool
                        </Link>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => handleDeleteTool(toolRecord)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                    <div className={styles.cardBody}>
                      {opponentLine || "Saved rotations draft."}
                      {versionCount ? ` · ${versionCount} version${versionCount === 1 ? "" : "s"}` : ""}
                      {lineupCount ? ` · ${lineupCount} saved lineup${lineupCount === 1 ? "" : "s"}` : ""}
                    </div>
                    <div className={styles.cardFooter}>Updated {formatTimestamp(toolRecord.updatedAt)}</div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : tab === "tools" ? (
        <section className={styles.section}>
          {toolVaultStatus ? <div className={styles.toolToolbarStatus}>{toolVaultStatus}</div> : null}
          {analysisToolRecords.length === 0
            && visualDrillPresetRecords.length === 0
            && (!canUseAdminTools || scoutingToolRecords.length === 0) ? (
            <div className={styles.emptyState}>You have not saved any tools yet.</div>
          ) : (
            <div className={styles.list}>
              {visualDrillPresetRecords.map((toolRecord) => {
                const isDeleting = deletingKey === `tool:${toolRecord.id}`;
                const config = toolRecord.payload?.config && typeof toolRecord.payload.config === "object"
                  ? toolRecord.payload.config
                  : toolRecord.payload || {};
                const componentTypes = [
                  config.useDigits ? "digits" : null,
                  config.useShapes ? "shapes" : null,
                  config.useImages ? "images" : null,
                ].filter(Boolean).join(" + ");
                return (
                  <article key={toolRecord.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitleGroup}>
                        <div className={styles.cardTitle}>{toolRecord.title || "Untitled"}</div>
                        <div className={styles.cardMeta}>Visual Drill · Favorite filters</div>
                      </div>
                      <div className={styles.cardActions}>
                        <Link className={styles.cardLink} to={`/tools?tab=visual-drill&preset=${encodeURIComponent(toolRecord.id)}`}>Open Tool</Link>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => handleDeleteTool(toolRecord)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                    <div className={styles.cardBody}>
                      {`${config.minimumSpaces ?? 0}–${config.maximumSpaces ?? 0} spaces`}
                      {componentTypes ? ` · ${componentTypes}` : " · background only"}
                      {config.selfTimerEnabled ? ` · auto ${config.minimumInterval ?? 1}–${config.maximumInterval ?? 1}s` : ""}
                    </div>
                    <div className={styles.cardFooter}>Updated {formatTimestamp(toolRecord.updatedAt)}</div>
                  </article>
                );
              })}
              {canUseAdminTools ? scoutingToolRecords.map((toolRecord) => {
                const isDeleting = deletingKey === `tool:${toolRecord.id}`;
                const payload = toolRecord.payload && typeof toolRecord.payload === "object" ? toolRecord.payload : {};
                const teamLabel = String(payload.scoutingResult?.team?.name || payload.scoutingResult?.team?.tricode || "").trim();
                const headline = String(payload.scoutingResult?.headline || "").trim();
                const rangeLabel = String(payload.scoutingResult?.rangeLabel || payload.scoutingResult?.selection?.rangeLabel || "").trim();
                return (
                  <article key={toolRecord.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitleGroup}>
                        <div className={styles.cardTitle}>{toolRecord.title || "Untitled"}</div>
                        <div className={styles.cardMeta}>
                          Pre-Game Scouting Packet
                        </div>
                      </div>
                      <div className={styles.cardActions}>
                        <Link className={styles.cardLink} to={`/tools?tab=scouting&packet=${encodeURIComponent(toolRecord.id)}`}>
                          Open Tool
                        </Link>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => handleDeleteTool(toolRecord)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                    <div className={styles.cardBody}>
                      {headline || rangeLabel || teamLabel || "Saved scouting packet."}
                    </div>
                    <div className={styles.cardFooter}>Updated {formatTimestamp(toolRecord.updatedAt)}</div>
                  </article>
                );
              }) : null}
              {analysisToolRecords.map((toolRecord) => {
                const isDeleting = deletingKey === `tool:${toolRecord.id}`;
                const payload = toolRecord.payload && typeof toolRecord.payload === "object" ? toolRecord.payload : {};
                const savedGameId = String(payload.gameId || "").trim();
                const rangeLabel = String(payload.rangeLabel || "").trim();
                const analysisHeadline = String(payload.analysisResult?.headline || "").trim();
                const backParams = new URLSearchParams();
                backParams.set("analysis", toolRecord.id);
                return (
                  <article key={toolRecord.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitleGroup}>
                        <div className={styles.cardTitle}>{toolRecord.title || "Untitled"}</div>
                        <div className={styles.cardMeta}>
                          Analysis · Saved chunk
                        </div>
                      </div>
                      <div className={styles.cardActions}>
                        <Link className={styles.cardLink} to={savedGameId ? `/g/${savedGameId}?${backParams.toString()}` : "/me?tab=tools"}>
                          Open Analysis
                        </Link>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => handleDeleteTool(toolRecord)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                    <div className={styles.cardBody}>
                      {analysisHeadline || rangeLabel || "Saved analysis chunk."}
                    </div>
                    <div className={styles.cardFooter}>Updated {formatTimestamp(toolRecord.updatedAt)}</div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className={styles.section}>
          {toolVaultStatus ? <div className={styles.toolToolbarStatus}>{toolVaultStatus}</div> : null}
          {lateGameFeedbackRecords.length ? (
            <div className={styles.toolToolbar}>
              <button
                type="button"
                className={styles.cardLink}
                onClick={exportLateGameFeedback}
              >
                Export Feedback
              </button>
              {toolExportStatus ? (
                <div className={styles.toolToolbarStatus}>{toolExportStatus}</div>
              ) : null}
            </div>
          ) : null}
          {lateGameFeedbackRecords.length === 0 ? (
            <div className={styles.emptyState}>You have not saved any late-game feedback yet.</div>
          ) : (
            <div className={styles.list}>
              {lateGameFeedbackRecords.map((toolRecord) => {
                const isDeleting = deletingKey === `tool:${toolRecord.id}`;
                const payload = toolRecord.payload && typeof toolRecord.payload === "object" ? toolRecord.payload : {};
                const strategyState = payload.strategyState && typeof payload.strategyState === "object" ? payload.strategyState : {};
                const strategyEvaluation = payload.strategyEvaluation && typeof payload.strategyEvaluation === "object" ? payload.strategyEvaluation : {};
                const savedGameId = String(payload.gameId || "").trim();
                const verdict = payload.verdict === "correct" ? "Correct" : "Needs Work";
                const summary = String(payload.suggestedCall || strategyEvaluation.headline || strategyEvaluation.summary || "").trim();
                return (
                  <article key={toolRecord.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitleGroup}>
                        <div className={styles.cardTitle}>{toolRecord.title || "Untitled"}</div>
                        <div className={styles.cardMeta}>
                          Late Game Feedback · {strategyState.vantageTeamTricode || "Team"} · {strategyState.periodLabel || "--"} {strategyState.clock || "--"} · {verdict}
                        </div>
                      </div>
                      <div className={styles.cardActions}>
                        <Link className={styles.cardLink} to={savedGameId ? `/g/${savedGameId}` : "/me?tab=late-game"}>
                          Open Game
                        </Link>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => handleDeleteTool(toolRecord)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                    <div className={styles.cardBody}>
                      {summary || "Saved late-game feedback."}
                      {payload.notes ? `\n\n${payload.notes}` : ""}
                    </div>
                    {Array.isArray(payload.tags) && payload.tags.length ? (
                      <div className={styles.tagRow}>
                        {payload.tags.map((tag) => (
                          <span key={tag} className={styles.tagChip}>{tag}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className={styles.cardFooter}>Updated {formatTimestamp(toolRecord.updatedAt)}</div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
