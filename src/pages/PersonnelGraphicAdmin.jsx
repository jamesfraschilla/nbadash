import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import fireTagUrl from "../assets/personnel/fire.png";
import coldTagUrl from "../assets/personnel/cold.png";
import drivesRightTagUrl from "../assets/personnel/drives-right.png";
import drivesLeftTagUrl from "../assets/personnel/drives-left.png";
import { fetchNbaPlayerStats } from "../api.js";
import { useAuth } from "../auth/useAuth.js";
import Dialog from "../components/ui/Dialog.jsx";
import { GLEAGUE_TEAMS, NBA_TEAMS, getLeagueTeam } from "../data/nbaTeams.js";
import {
  DEFAULT_PERSONNEL_STAT_KEYS,
  PERSONNEL_SLOT_COUNT,
  PERSONNEL_STAT_OPTIONS,
  PERSONNEL_TAG_OPTIONS,
  PERSONNEL_THREE_POINT_COLOR_OPTIONS,
  createPersonnelDraft,
  createPersonnelRow,
  clearPersonnelStatOverridesForSeason,
  formatPersonnelStatValue,
  getCurrentPersonnelSeason,
  getPersonnelThreePointColorForPercentage,
  getPreviousPersonnelSeason,
  hasExactlyFourPersonnelStats,
  hydratePersonnelDraft,
  mergePersonnelStatOverrides,
  normalizePersonnelStatsMap,
  orderPersonnelSelectedStats,
  populatePersonnelDraftFromRoster,
  reorderPersonnelStatColumns,
  togglePersonnelRowStat,
  validatePersonnelDraftForExport,
} from "../personnelGraphic.js";
import {
  deleteSavedToolRecord,
  deleteSavedToolRecordRemote,
  getSavedToolRecord,
  getSavedToolRecordRemote,
  saveToolRecordRemote,
  TOOL_RECORD_TYPES,
} from "../toolVault.js";
import { exportPersonnelGraphics } from "./personnelGraphicExport.js";
import { createSerialTaskQueue } from "../serialTaskQueue.js";
import styles from "./PersonnelGraphicAdmin.module.css";

const TAG_IMAGE_URLS = {
  fire: fireTagUrl,
  cold: coldTagUrl,
  drives_right: drivesRightTagUrl,
  drives_left: drivesLeftTagUrl,
};

const PERSONNEL_STAT_OPTIONS_BY_KEY = Object.freeze(Object.fromEntries(
  PERSONNEL_STAT_OPTIONS.map((option) => [option.key, option])
));

const STAT_COLUMN_DRAG_THRESHOLD_PX = 6;

function StatColumnHeader({
  option,
  selectedCount,
  populatedCount,
  selectionBlocked,
  dragging,
  dropTarget,
  dropPlacement,
  cellId,
  onToggleAll,
  onPointerDown,
}) {
  const checkboxRef = useRef(null);
  const allSelected = populatedCount > 0 && selectedCount === populatedCount;
  const partiallySelected = selectedCount > 0 && selectedCount < populatedCount;

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = partiallySelected;
  }, [partiallySelected]);

  return (
    <div
      className={`${styles.statHeader} ${dragging ? styles.statHeaderDragging : ""} ${dropTarget ? styles.statHeaderDropTarget : ""}`}
      role="columnheader"
      tabIndex={0}
      aria-label={`Drag to reorder ${option.label} column`}
      aria-grabbed={dragging}
      title={`Drag to reorder ${option.label}`}
      data-personnel-stat-cell-id={cellId}
      data-personnel-stat-header-key={option.key}
      data-drop-placement={dropTarget ? dropPlacement : undefined}
      onPointerDown={(event) => onPointerDown(event, option.key)}
    >
      <span className={styles.statHeaderLabel}>{option.label}</span>
      <label
        className={styles.headerStatCheckbox}
        title={allSelected
          ? `Unselect ${option.label} for every player`
          : selectionBlocked
            ? `Unselect another stat column before selecting ${option.label} for every player`
            : `Select ${option.label} for every player`}
        draggable={false}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onDragStart={(event) => event.stopPropagation()}
      >
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allSelected}
          disabled={!populatedCount}
          onChange={() => onToggleAll(option.key)}
          aria-label={allSelected
            ? `Unselect ${option.label} for all players`
            : `Select ${option.label} for all players`}
        />
      </label>
    </div>
  );
}

function formatPlayerOption(player) {
  const jersey = String(player?.jerseyNum || "").trim();
  const name = String(player?.fullName || "").trim();
  return jersey ? `#${jersey} ${name}` : name;
}

function hasConfirmedStatValues(stats) {
  if (!stats || typeof stats !== "object") return false;
  return [
    "gamesPlayed",
    "ppg",
    "rpg",
    "threePointPercentage",
    "apg",
    "bpg",
    "spg",
    "fta",
    "fieldGoalAttemptsPerGame",
    "threePointAttemptsPerGame",
  ].some((key) => Number.isFinite(stats[key]));
}

function formatSourceDate(value, league = "nba", season = "", cacheFallback = false) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    return league === "gleague"
      ? "Latest published G League roster unavailable"
      : "Live roster unavailable — using the local roster snapshot";
  }
  if (league === "gleague") {
    const seasonLabel = season ? ` (${season})` : "";
    const cacheLabel = cacheFallback ? "cached " : "";
    return `Latest published G League roster${seasonLabel} ${cacheLabel}updated ${date.toLocaleString()}`;
  }
  if (cacheFallback) return `Live roster unavailable — cached roster updated ${date.toLocaleString()}`;
  return `Live roster updated ${date.toLocaleString()}`;
}

function formatStatsSource(value) {
  const labels = String(value || "")
    .split("+")
    .map((source) => source.trim())
    .filter(Boolean)
    .map((source) => (
      source.includes("gleague")
        ? "G League API"
        : source.includes("espn")
          ? "ESPN fallback"
          : source === "nba-web-fallback"
          ? "NBA.com"
          : "NBA API"
    ));
  return labels.length ? ` · ${[...new Set(labels)].join(" + ")}` : "";
}

function getValidationMessage(validation) {
  const firstError = validation?.errors?.[0];
  if (!firstError) return "Ready to export";
  return firstError.message || "Every exported player must have exactly four stats selected.";
}

function buildDraftTitle(team, season, league = "nba") {
  return `${team?.fullName || (league === "gleague" ? "G League" : "NBA")} Personnel Graphics · ${season}`;
}

function formatSupabaseSaveError(error) {
  const message = String(error?.message || "").trim();
  if (message.startsWith("Sign in") || message.startsWith("Select a team")) return message;
  return message
    ? `Unable to save this draft to Supabase. ${message}`
    : "Unable to save this draft to Supabase. Sign in again and try once more.";
}

function buildExportItems(rows, rosterById, statsById, statOrder) {
  return rows.map((row) => ({
    player: rosterById[row.personId] || row,
    stats: mergePersonnelStatOverrides(statsById[row.personId] || {}, row.statOverrides),
    selectedStats: orderPersonnelSelectedStats(row.selectedStats, statOrder),
    tags: row.tags,
    threePointColor: row.threePointColor,
  }));
}

export default function PersonnelGraphicAdmin({ rosterSources, rosterMetadata }) {
  const { accountsEnabled, user } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState(() => createPersonnelDraft());
  const [recordId, setRecordId] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [status, setStatus] = useState("");
  const [autoSaveStatus, setAutoSaveStatus] = useState("");
  const [dialog, setDialog] = useState(null);
  const [draggedStatKey, setDraggedStatKey] = useState("");
  const [dragOverStatKey, setDragOverStatKey] = useState("");
  const [dragOverPlacement, setDragOverPlacement] = useState("before");
  const [statDragState, setStatDragState] = useState(null);
  const recordIdRef = useRef("");
  const draftRef = useRef(draft);
  const tableRef = useRef(null);
  const statDragActiveRef = useRef(false);
  const dragOverStatKeyRef = useRef("");
  const dragOverPlacementRef = useRef("before");
  const statLayoutRectsRef = useRef(new Map());
  const previousVisualStatOrderKeyRef = useRef("");
  const autoSaveTimerRef = useRef(null);
  const autoSaveRunRef = useRef(0);
  const autoSavePendingDraftRef = useRef(null);
  const autoSaveQueueRef = useRef(createSerialTaskQueue());
  const persistPersonnelDraftRef = useRef(null);
  const vaultUserId = user?.id || (!accountsEnabled ? "guest" : "");
  const personnelParam = String(params.get("personnel") || "").trim();
  const teamId = String(draft.teamId || "").trim();
  const season = String(draft.season || "").trim();
  const league = draft.league === "gleague" ? "gleague" : "nba";
  const leagueLabel = league === "gleague" ? "G League" : "NBA";
  const teams = league === "gleague" ? GLEAGUE_TEAMS : NBA_TEAMS;
  const rosterMap = rosterSources?.[league] || {};
  const rosterFetchedAt = rosterMetadata?.[league]?.fetchedAt;
  const rosterSeason = rosterMetadata?.[league]?.season;
  const rosterCacheFallback = Boolean(rosterMetadata?.[league]?.cacheFallback);
  const currentStatsSeason = useMemo(() => getCurrentPersonnelSeason(), []);
  const previousStatsSeason = useMemo(
    () => getPreviousPersonnelSeason(currentStatsSeason),
    [currentStatsSeason]
  );
  const seasonOptions = useMemo(() => (
    [...new Set([currentStatsSeason, previousStatsSeason, season].filter(Boolean))]
  ), [currentStatsSeason, previousStatsSeason, season]);
  const selectedTeam = getLeagueTeam(teamId, league);
  const roster = useMemo(() => (
    Array.isArray(rosterMap?.[teamId]) ? rosterMap[teamId] : []
  ), [rosterMap, teamId]);
  const rosterById = useMemo(() => (
    Object.fromEntries(roster.map((player) => [String(player.personId), player]))
  ), [roster]);
  const statsPlayers = useMemo(() => draft.rows
    .filter((row) => row.personId)
    .map((row) => rosterById[row.personId] || row), [draft.rows, rosterById]);
  const statsPlayerKey = statsPlayers.map((player) => player.personId).join(",");

  const {
    data: statsPayload,
    isLoading: statsLoading,
    isFetching: statsFetching,
    isSuccess: statsLoaded,
    error: statsError,
  } = useQuery({
    queryKey: ["personnel-player-stats", league, season, teamId, statsPlayerKey],
    queryFn: ({ signal }) => fetchNbaPlayerStats({
      league,
      season,
      teamId,
      players: statsPlayers,
      signal,
    }),
    enabled: Boolean(teamId),
    staleTime: 6 * 60 * 60 * 1000,
    retry: 0,
  });
  const statsById = useMemo(
    () => normalizePersonnelStatsMap(statsPayload, roster),
    [roster, statsPayload]
  );
  const statsReady = Boolean(teamId && statsLoaded && !statsError);
  const statsBlocking = Boolean(teamId && (statsLoading || statsFetching));
  const selectedValidation = useMemo(
    () => validatePersonnelDraftForExport(draft, { mode: "selected" }),
    [draft]
  );
  const allValidation = useMemo(
    () => validatePersonnelDraftForExport(draft, { mode: "all" }),
    [draft]
  );
  const populatedRows = useMemo(() => draft.rows.filter((row) => row.personId), [draft.rows]);
  const visualStatOrderKey = draft.statOrder.join("|");
  const orderedStatOptions = useMemo(() => (
    draft.statOrder
      .map((key) => PERSONNEL_STAT_OPTIONS_BY_KEY[key])
      .filter(Boolean)
  ), [draft.statOrder]);
  const statSelectionCounts = useMemo(() => Object.fromEntries(
    PERSONNEL_STAT_OPTIONS.map((option) => [
      option.key,
      populatedRows.filter((row) => row.selectedStats.includes(option.key)).length,
    ])
  ), [populatedRows]);
  const allPopulatedRowsEnabled = populatedRows.length > 0 && populatedRows.every((row) => row.enabled);
  const exportMode = allPopulatedRowsEnabled ? "all" : "selected";
  const exportValidation = exportMode === "all" ? allValidation : selectedValidation;
  const exportReady = exportValidation.valid && statsReady;
  const exportButtonLabel = exportMode === "all" ? "Export All" : "Export Selected";
  const exportButtonTitle = !exportValidation.valid
    ? getValidationMessage(exportValidation)
    : !statsReady
      ? `${season} ${leagueLabel} stats must finish loading before export`
      : exportMode === "all"
        ? "Export every populated roster slot"
        : "Export checked players";

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useLayoutEffect(() => {
    const root = tableRef.current;
    if (!root) return;
    const shouldAnimate = Boolean(
      previousVisualStatOrderKeyRef.current
      && previousVisualStatOrderKeyRef.current !== visualStatOrderKey
    );
    const nextRects = new Map();
    root.querySelectorAll("[data-personnel-stat-cell-id]").forEach((element) => {
      const cellId = element.getAttribute("data-personnel-stat-cell-id");
      if (!cellId) return;
      const rect = element.getBoundingClientRect();
      nextRects.set(cellId, rect);
      const previousRect = statLayoutRectsRef.current.get(cellId);
      if (!shouldAnimate || !previousRect || typeof element.animate !== "function") return;
      const deltaX = previousRect.left - rect.left;
      const deltaY = previousRect.top - rect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
      element.animate([
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: "translate(0, 0)" },
      ], {
        duration: 190,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      });
    });
    statLayoutRectsRef.current = nextRects;
    previousVisualStatOrderKeyRef.current = visualStatOrderKey;
  }, [draft.rows, visualStatOrderKey]);

  useEffect(() => {
    recordIdRef.current = recordId;
  }, [recordId]);

  const discardPendingAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    autoSavePendingDraftRef.current = null;
    autoSaveRunRef.current += 1;
  }, []);

  const persistPersonnelDraft = useCallback(async (draftToPersist) => {
    const draftTeamId = String(draftToPersist?.teamId || "").trim();
    if (!draftTeamId) throw new Error("Select a team before saving.");
    if (!accountsEnabled || !user?.id) {
      throw new Error("Sign in to save personnel graphics to Supabase.");
    }

    const draftSeason = String(draftToPersist?.season || "").trim();
    const draftLeague = draftToPersist?.league === "gleague" ? "gleague" : "nba";
    const draftTeam = getLeagueTeam(draftTeamId, draftLeague);
    const id = recordIdRef.current || crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const record = {
      id,
      type: TOOL_RECORD_TYPES.PERSONNEL_GRAPHIC,
      title: buildDraftTitle(draftTeam, draftSeason, draftLeague),
      createdAt: timestamp,
      updatedAt: timestamp,
      payload: draftToPersist,
    };

    const savedRecord = await saveToolRecordRemote(user.id, record);
    if (!savedRecord) throw new Error("Supabase did not return a saved draft.");

    recordIdRef.current = savedRecord.id;
    setRecordId(savedRecord.id);
    await queryClient.invalidateQueries({ queryKey: ["owned-tools", user.id] });

    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", "graphics");
    nextParams.set("graphic", "personnel");
    nextParams.set("personnel", savedRecord.id);
    setParams(nextParams, { replace: true });
    return savedRecord;
  }, [accountsEnabled, params, queryClient, setParams, user?.id]);

  useEffect(() => {
    persistPersonnelDraftRef.current = persistPersonnelDraft;
  }, [persistPersonnelDraft]);

  const persistDraftInOrder = useCallback((nextDraft, { autoSave = false } = {}) => {
    const runId = autoSaveRunRef.current + 1;
    autoSaveRunRef.current = runId;
    const operation = autoSaveQueueRef.current.run(() => persistPersonnelDraft(nextDraft));

    if (autoSave) {
      operation.then(() => {
        if (autoSaveRunRef.current === runId) {
          setAutoSaveStatus("Tags and colors autosaved to Supabase.");
        }
      }).catch((error) => {
        console.error("Failed to autosave personnel tags/colors.", error);
        if (autoSaveRunRef.current === runId) {
          setAutoSaveStatus(formatSupabaseSaveError(error));
        }
      });
    }
    return operation;
  }, [persistPersonnelDraft]);

  const queueTagColorAutoSave = useCallback((nextDraft) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSavePendingDraftRef.current = nextDraft;
    setAutoSaveStatus("Autosaving tags and colors to Supabase...");

    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      const pendingDraft = autoSavePendingDraftRef.current;
      autoSavePendingDraftRef.current = null;
      if (pendingDraft) persistDraftInOrder(pendingDraft, { autoSave: true });
    }, 450);
  }, [persistDraftInOrder]);

  const flushPendingAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    const pendingDraft = autoSavePendingDraftRef.current;
    autoSavePendingDraftRef.current = null;
    return pendingDraft
      ? persistDraftInOrder(pendingDraft, { autoSave: true })
      : autoSaveQueueRef.current.wait();
  }, [persistDraftInOrder]);

  useEffect(() => () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const pendingDraft = autoSavePendingDraftRef.current;
    if (pendingDraft && persistPersonnelDraftRef.current) {
      void autoSaveQueueRef.current
        .run(() => persistPersonnelDraftRef.current?.(pendingDraft))
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!teamId || !roster.length) return;
    setDraft((current) => {
      const nextDraft = populatePersonnelDraftFromRoster(current, roster, { teamId, league });
      draftRef.current = nextDraft;
      return nextDraft;
    });
  }, [league, roster, teamId]);

  useEffect(() => {
    if (!statsReady) return;
    setDraft((current) => {
      let changed = false;
      const rows = current.rows.map((row) => {
        if (!row.personId || row.threePointColorEdited) return row;
        const rowStats = statsById[row.personId];
        if (!rowStats || rowStats.threePointPercentage === null || rowStats.threePointPercentage === undefined) {
          return row;
        }
        const defaultColor = getPersonnelThreePointColorForPercentage(rowStats.threePointPercentage);
        if (row.threePointColor === defaultColor) return row;
        changed = true;
        return { ...row, threePointColor: defaultColor };
      });
      if (!changed) return current;
      const nextDraft = { ...current, rows };
      draftRef.current = nextDraft;
      return nextDraft;
    });
  }, [statsById, statsReady]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedDraft() {
      if (!personnelParam || !vaultUserId) {
        if (!cancelled) setRecordId("");
        return;
      }

      let savedRecord = null;
      try {
        savedRecord = accountsEnabled && user?.id
          ? await getSavedToolRecordRemote(user.id, personnelParam)
          : getSavedToolRecord(vaultUserId, personnelParam);
      } catch (error) {
        console.error("Failed to load the remote personnel draft, falling back to local storage.", error);
        savedRecord = getSavedToolRecord(vaultUserId, personnelParam);
      }

      if (cancelled) return;
      if (!savedRecord?.payload || savedRecord.type !== TOOL_RECORD_TYPES.PERSONNEL_GRAPHIC) {
        setRecordId("");
        setStatus("Saved personnel draft not found.");
        return;
      }

      setRecordId(savedRecord.id);
      const hydratedDraft = hydratePersonnelDraft(savedRecord.payload);
      draftRef.current = hydratedDraft;
      setDraft(hydratedDraft);
      setAutoSaveStatus("");
      setStatus(`Loaded ${savedRecord.title}`);
    }

    loadSavedDraft();
    return () => {
      cancelled = true;
    };
  }, [accountsEnabled, personnelParam, user?.id, vaultUserId]);

  const updateRow = (index, updater, options = {}) => {
    const nextDraft = {
      ...draftRef.current,
      rows: draftRef.current.rows.map((row, rowIndex) => (
        rowIndex === index
          ? (typeof updater === "function" ? updater(row) : { ...row, ...updater })
          : row
      )),
    };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setStatus("");
    if (options.autoSaveTagsAndColors) {
      queueTagColorAutoSave(nextDraft);
    } else if (autoSavePendingDraftRef.current) {
      autoSavePendingDraftRef.current = nextDraft;
    }
  };

  const handleLeagueChange = async (nextLeagueValue) => {
    await flushPendingAutoSave().catch(() => undefined);
    const nextLeague = nextLeagueValue === "gleague" ? "gleague" : "nba";
    const nextDraft = createPersonnelDraft({ league: nextLeague, season });
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setRecordId("");
    recordIdRef.current = "";
    setDialog(null);
    setAutoSaveStatus("");
    setStatus("");
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", "graphics");
    nextParams.set("graphic", "personnel");
    nextParams.delete("personnel");
    setParams(nextParams, { replace: true });
  };

  const handleTeamChange = async (nextTeamId) => {
    await flushPendingAutoSave().catch(() => undefined);
    const nextRoster = Array.isArray(rosterMap?.[nextTeamId]) ? rosterMap[nextTeamId] : [];
    const emptyDraft = createPersonnelDraft({ league, teamId: nextTeamId, season });
    const nextDraft = populatePersonnelDraftFromRoster(emptyDraft, nextRoster, { league, teamId: nextTeamId });
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setRecordId("");
    recordIdRef.current = "";
    setDialog(null);
    setAutoSaveStatus("");
    setStatus(nextTeamId && !nextRoster.length ? "Waiting for this team's roster..." : "");
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", "graphics");
    nextParams.set("graphic", "personnel");
    nextParams.delete("personnel");
    setParams(nextParams, { replace: true });
  };

  const handleSeasonChange = async (nextSeason) => {
    await flushPendingAutoSave().catch(() => undefined);
    const nextDraft = clearPersonnelStatOverridesForSeason(draftRef.current, nextSeason);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setAutoSaveStatus("");
    setStatus("");
  };

  const handlePlayerChange = (index, nextPersonId) => {
    const player = rosterById[nextPersonId];
    updateRow(index, player
      ? createPersonnelRow(index, {
        ...player,
        enabled: true,
        selectedStats: DEFAULT_PERSONNEL_STAT_KEYS,
        threePointColor: getPersonnelThreePointColorForPercentage(
          statsById[nextPersonId]?.threePointPercentage
        ),
        threePointColorEdited: false,
      })
      : createPersonnelRow(index));
  };

  const getRowStatInputValue = (row, statKey) => {
    if (!row?.personId) return "";
    const overrides = row.statOverrides || {};
    if (Object.prototype.hasOwnProperty.call(overrides, statKey)) {
      return overrides[statKey];
    }
    return formatPersonnelStatValue(statsById[row.personId] || {}, statKey);
  };

  const handleStatOverrideChange = (index, statKey, value) => {
    updateRow(index, (row) => ({
      ...row,
      statOverrides: {
        ...(row.statOverrides || {}),
        [statKey]: value,
      },
    }));
  };

  const handleToggleAllRows = () => {
    const nextEnabled = !allPopulatedRowsEnabled;
    const nextDraft = {
      ...draftRef.current,
      rows: draftRef.current.rows.map((row) => (
        row.personId ? { ...row, enabled: nextEnabled } : row
      )),
    };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    if (autoSavePendingDraftRef.current) autoSavePendingDraftRef.current = nextDraft;
    setStatus("");
  };

  const handleToggleAllStatColumn = (statKey) => {
    const currentDraft = draftRef.current;
    const currentRows = currentDraft.rows.filter((row) => row.personId);
    if (!currentRows.length) return;
    const allSelected = currentRows.every((row) => row.selectedStats.includes(statKey));
    const shouldSelect = !allSelected;
    const blockedRows = shouldSelect
      ? currentRows.filter((row) => (
        !row.selectedStats.includes(statKey) && row.selectedStats.length >= 4
      ))
      : [];
    const optionLabel = PERSONNEL_STAT_OPTIONS_BY_KEY[statKey]?.label || statKey;

    if (blockedRows.length) {
      setStatus(`Unselect another stat column before selecting ${optionLabel} for all players.`);
      return;
    }

    const nextDraft = {
      ...currentDraft,
      rows: currentDraft.rows.map((row) => {
        if (!row.personId) return row;
        const selectedStats = row.selectedStats.includes(statKey)
          ? (shouldSelect ? row.selectedStats : row.selectedStats.filter((key) => key !== statKey))
          : (shouldSelect ? [...row.selectedStats, statKey] : row.selectedStats);
        return {
          ...row,
          selectedStats: orderPersonnelSelectedStats(selectedStats, currentDraft.statOrder),
        };
      }),
    };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    if (autoSavePendingDraftRef.current) autoSavePendingDraftRef.current = nextDraft;
    setStatus(`${shouldSelect ? "Selected" : "Unselected"} ${optionLabel} for all populated players.`);
  };

  const getStatDropTarget = useCallback((clientX) => {
    const root = tableRef.current;
    if (!root) return null;
    const cells = Array.from(root.querySelectorAll("[data-personnel-stat-header-key]"))
      .map((element) => ({
        key: element.getAttribute("data-personnel-stat-header-key"),
        rect: element.getBoundingClientRect(),
      }))
      .filter(({ key, rect }) => key && rect.width > 0)
      .sort((a, b) => a.rect.left - b.rect.left);
    if (!cells.length) return null;

    const hoveredCell = cells.find(({ rect }) => clientX >= rect.left && clientX <= rect.right);
    if (hoveredCell) {
      return {
        targetKey: hoveredCell.key,
        placement: clientX >= hoveredCell.rect.left + (hoveredCell.rect.width / 2) ? "after" : "before",
      };
    }

    const firstCell = cells[0];
    const lastCell = cells[cells.length - 1];
    if (clientX < firstCell.rect.left) return { targetKey: firstCell.key, placement: "before" };
    if (clientX > lastCell.rect.right) return { targetKey: lastCell.key, placement: "after" };

    const nextCell = cells.find(({ rect }) => clientX < rect.left + (rect.width / 2));
    return nextCell
      ? { targetKey: nextCell.key, placement: "before" }
      : { targetKey: lastCell.key, placement: "after" };
  }, []);

  const clearStatDrag = useCallback(() => {
    statDragActiveRef.current = false;
    dragOverStatKeyRef.current = "";
    dragOverPlacementRef.current = "before";
    setStatDragState(null);
    setDraggedStatKey("");
    setDragOverStatKey("");
    setDragOverPlacement("before");
  }, []);

  const commitStatColumnOrder = useCallback((sourceKey, targetKey, placement) => {
    const currentDraft = draftRef.current;
    const nextOrder = reorderPersonnelStatColumns(
      currentDraft.statOrder,
      sourceKey,
      targetKey,
      placement
    );
    const orderChanged = nextOrder.some((key, index) => key !== currentDraft.statOrder[index]);
    if (!orderChanged) return false;

    const nextDraft = {
      ...currentDraft,
      statOrder: nextOrder,
      rows: currentDraft.rows.map((row) => ({
        ...row,
        selectedStats: orderPersonnelSelectedStats(row.selectedStats, nextOrder),
      })),
    };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    if (autoSavePendingDraftRef.current) autoSavePendingDraftRef.current = nextDraft;
    const sourceLabel = PERSONNEL_STAT_OPTIONS_BY_KEY[sourceKey]?.label || sourceKey;
    const targetLabel = PERSONNEL_STAT_OPTIONS_BY_KEY[targetKey]?.label || targetKey;
    setStatus(`Moved ${sourceLabel} ${placement} ${targetLabel}. Save to keep this column order.`);
    return true;
  }, []);

  const handleStatPointerDown = useCallback((event, statKey) => {
    if (event.button !== 0 || !PERSONNEL_STAT_OPTIONS_BY_KEY[statKey]) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    statDragActiveRef.current = false;
    dragOverStatKeyRef.current = "";
    dragOverPlacementRef.current = "before";
    setStatDragState({
      pointerId: event.pointerId,
      sourceKey: statKey,
      originX: event.clientX,
      originY: event.clientY,
    });
  }, []);

  useEffect(() => {
    if (!statDragState) return undefined;

    const beginActiveDrag = () => {
      if (statDragActiveRef.current) return;
      statDragActiveRef.current = true;
      setDraggedStatKey(statDragState.sourceKey);
    };

    const updateDropTarget = (clientX) => {
      const target = getStatDropTarget(clientX);
      if (!target) return;
      dragOverStatKeyRef.current = target.targetKey;
      dragOverPlacementRef.current = target.placement;
      setDragOverStatKey((current) => (current === target.targetKey ? current : target.targetKey));
      setDragOverPlacement((current) => (current === target.placement ? current : target.placement));
    };

    const handlePointerMove = (event) => {
      if (event.pointerId !== statDragState.pointerId) return;
      event.preventDefault();
      if (!statDragActiveRef.current) {
        const deltaX = event.clientX - statDragState.originX;
        const deltaY = event.clientY - statDragState.originY;
        if (Math.hypot(deltaX, deltaY) < STAT_COLUMN_DRAG_THRESHOLD_PX) return;
        beginActiveDrag();
      }
      updateDropTarget(event.clientX);
    };

    const handlePointerUp = (event) => {
      if (event.pointerId !== statDragState.pointerId) return;
      event.preventDefault();
      if (statDragActiveRef.current) {
        const target = {
          targetKey: dragOverStatKeyRef.current || statDragState.sourceKey,
          placement: dragOverPlacementRef.current || "before",
        };
        commitStatColumnOrder(statDragState.sourceKey, target.targetKey, target.placement);
      }
      clearStatDrag();
    };

    const handlePointerCancel = (event) => {
      if (event.pointerId !== statDragState.pointerId) return;
      clearStatDrag();
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { passive: false });
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [clearStatDrag, commitStatColumnOrder, getStatDropTarget, statDragState]);

  const handleToggleTag = (index, tagKey) => {
    updateRow(index, (row) => ({
      ...row,
      tags: row.tags.includes(tagKey)
        ? row.tags.filter((key) => key !== tagKey)
        : [...row.tags, tagKey],
    }), { autoSaveTagsAndColors: true });
  };

  const handleSave = async () => {
    if (busyAction || !teamId) {
      if (!teamId) setStatus("Select a team before saving.");
      return;
    }
    setBusyAction("save");
    discardPendingAutoSave();
    setAutoSaveStatus("");

    try {
      const savedRecord = await persistDraftInOrder(draftRef.current);
      setStatus(`Saved to Supabase as ${savedRecord.title}`);
    } catch (error) {
      console.error("Failed to save personnel draft to Supabase.", error);
      setStatus(formatSupabaseSaveError(error));
    } finally {
      setBusyAction("");
    }
  };

  const handleDelete = async () => {
    if (!vaultUserId || !recordId || busyAction) return;
    if (!window.confirm("Delete this saved personnel graphics draft?")) return;
    setBusyAction("delete");
    discardPendingAutoSave();
    try {
      await autoSaveQueueRef.current.wait();
      if (accountsEnabled && user?.id) {
        await deleteSavedToolRecordRemote(user.id, recordId);
      } else {
        deleteSavedToolRecord(vaultUserId, recordId);
      }
      await queryClient.invalidateQueries({ queryKey: ["owned-tools", vaultUserId] });
      setRecordId("");
      recordIdRef.current = "";
      const emptyDraft = createPersonnelDraft();
      draftRef.current = emptyDraft;
      setDraft(emptyDraft);
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", "graphics");
      nextParams.set("graphic", "personnel");
      nextParams.delete("personnel");
      setParams(nextParams, { replace: true });
      setStatus("Deleted saved personnel draft.");
    } catch (error) {
      console.error("Failed to delete the remote personnel draft.", error);
      setStatus("Unable to delete this Supabase draft. It has not been removed; try again.");
    } finally {
      setBusyAction("");
    }
  };

  const handleReset = async () => {
    if (teamId && !window.confirm("Reset all personnel graphic selections?")) return;
    discardPendingAutoSave();
    await autoSaveQueueRef.current.wait();
    const emptyDraft = createPersonnelDraft();
    draftRef.current = emptyDraft;
    setDraft(emptyDraft);
    setRecordId("");
    recordIdRef.current = "";
    setDialog(null);
    setAutoSaveStatus("");
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", "graphics");
    nextParams.set("graphic", "personnel");
    nextParams.delete("personnel");
    setParams(nextParams, { replace: true });
    setStatus("Reset personnel graphics.");
  };

  const handleExport = async (mode) => {
    const validation = mode === "all" ? allValidation : selectedValidation;
    if (!validation.valid) {
      setStatus(getValidationMessage(validation));
      return;
    }
    if (!statsReady) {
      setStatus(`${season} ${leagueLabel} stats must finish loading before export.`);
      return;
    }
    if (busyAction) return;

    setBusyAction(`export-${mode}`);
    setStatus(`Rendering ${validation.rows.length} personnel graphic${validation.rows.length === 1 ? "" : "s"}...`);
    try {
      const exportedCount = await exportPersonnelGraphics({
        items: buildExportItems(validation.rows, rosterById, statsById, draftRef.current.statOrder),
        team: selectedTeam,
        teamId,
        league,
      });
      const zipSuffix = exportedCount > 1 ? " in one ZIP" : "";
      setStatus(`Exported ${exportedCount} personnel PNG${exportedCount === 1 ? "" : "s"}${zipSuffix}.`);
    } catch (error) {
      console.error("Failed to export personnel graphics.", error);
      setStatus(error?.message || "Unable to export personnel graphics.");
    } finally {
      setBusyAction("");
    }
  };

  const usedPersonIds = useMemo(() => new Set(
    draft.rows.map((row) => row.personId).filter(Boolean)
  ), [draft.rows]);
  const activeDialogRow = dialog ? draft.rows[dialog.rowIndex] : null;
  const currentColor = PERSONNEL_THREE_POINT_COLOR_OPTIONS.find(
    (option) => option.key === activeDialogRow?.threePointColor
  );

  return (
    <div className={styles.panel} aria-busy={statsBlocking}>
      {statsBlocking ? (
        <div className={styles.loadingOverlay} role="status" aria-live="polite">
          <div className={styles.loadingCard}>
            <span className={styles.loadingSpinner} aria-hidden="true" />
            <strong>Loading all available {season} stats</strong>
            <span>Checking {leagueLabel} sources. Empty player stats will remain blank once confirmed.</span>
          </div>
        </div>
      ) : null}
      <div className={`${styles.panelContent} ${statsBlocking ? styles.panelContentLoading : ""}`}>
      <div className={styles.setupCard}>
        <div className={styles.setupFields}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>League</span>
            <select className={styles.select} value={league} onChange={(event) => handleLeagueChange(event.target.value)}>
              <option value="nba">NBA</option>
              <option value="gleague">G League</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{leagueLabel} Team</span>
            <select className={styles.select} value={teamId} onChange={(event) => handleTeamChange(event.target.value)}>
              <option value="">Select team</option>
              {teams.map((team) => (
                <option key={team.teamId} value={team.teamId}>{team.fullName}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Stats Season</span>
            <select className={styles.select} value={season} onChange={(event) => handleSeasonChange(event.target.value)}>
              {seasonOptions.map((option) => (
                <option key={option} value={option}>
                  {option}{option === currentStatsSeason ? " (Current)" : option === previousStatsSeason ? " (Previous)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={styles.secondaryButton} onClick={handleReset} disabled={Boolean(busyAction)}>
            Reset
          </button>
        </div>
        <div className={styles.sourceMeta}>
          <strong>{rosterSeason ? `Roster season ${rosterSeason}` : `${leagueLabel} roster`}</strong>
          <span>{formatSourceDate(rosterFetchedAt, league, rosterSeason, rosterCacheFallback)}</span>
          {statsPayload?.season ? (
            <span>Stats: {statsPayload.season} regular season{formatStatsSource(statsPayload.source)}</span>
          ) : null}
        </div>
      </div>

      {!teamId ? (
        <p className={styles.notice}>Select a team to populate all {PERSONNEL_SLOT_COUNT} player slots.</p>
      ) : statsError ? (
        <p className={styles.errorNotice}>{season} player stats could not be loaded. Try again before exporting.</p>
      ) : statsLoading || statsFetching ? (
        <p className={styles.notice}>Loading {season} {leagueLabel} player stats...</p>
      ) : null}

      <div className={styles.tableShell}>
        <div ref={tableRef} className={styles.table} role="table" aria-label="Personnel graphic player settings">
          <div className={styles.headerRow} role="row">
            <span aria-label="Include">Use</span>
            <span>Player</span>
            {orderedStatOptions.map((option) => (
              <StatColumnHeader
                key={option.key}
                option={option}
                selectedCount={statSelectionCounts[option.key] || 0}
                populatedCount={populatedRows.length}
                selectionBlocked={populatedRows.some((row) => (
                  !row.selectedStats.includes(option.key) && row.selectedStats.length >= 4
                ))}
                dragging={draggedStatKey === option.key}
                dropTarget={Boolean(draggedStatKey && dragOverStatKey === option.key)}
                dropPlacement={dragOverPlacement}
                cellId={`header-${option.key}`}
                onToggleAll={handleToggleAllStatColumn}
                onPointerDown={handleStatPointerDown}
              />
            ))}
            <span>Tags</span>
            <span>3P Color</span>
          </div>

          {draft.rows.map((row, index) => {
            const statCountValid = hasExactlyFourPersonnelStats(row);
            const missingStats = Boolean(
              row.personId
              && statsReady
              && !hasConfirmedStatValues(statsById[row.personId])
            );
            const selectedColor = PERSONNEL_THREE_POINT_COLOR_OPTIONS.find((option) => option.key === row.threePointColor)
              || PERSONNEL_THREE_POINT_COLOR_OPTIONS[0];
            return (
              <div
                key={row.id}
                className={`${styles.playerRow} ${row.personId && !statCountValid ? styles.playerRowInvalid : ""}`}
                role="row"
              >
                <label className={styles.rowToggle} title={row.personId ? "Include in Export Selected" : "Select a player first"}>
                  <input
                    type="checkbox"
                    checked={Boolean(row.enabled && row.personId)}
                    disabled={!row.personId}
                    onChange={(event) => updateRow(index, { enabled: event.target.checked })}
                    aria-label={`Include slot ${index + 1} in selected export`}
                  />
                </label>
                <div className={styles.playerCell}>
                  <span className={styles.slotNumber}>{index + 1}</span>
                  <div className={styles.playerSelection}>
                    <select
                      className={styles.rowSelect}
                      value={row.personId}
                      onChange={(event) => handlePlayerChange(index, event.target.value)}
                      disabled={!teamId}
                      aria-label={`Player slot ${index + 1}`}
                    >
                      <option value="">Player</option>
                      {roster.map((player) => (
                        <option
                          key={player.personId}
                          value={player.personId}
                          disabled={usedPersonIds.has(player.personId) && row.personId !== player.personId}
                        >
                          {formatPlayerOption(player)}
                        </option>
                      ))}
                    </select>
                    {missingStats ? <span className={styles.missingStats}>No {season} stats available</span> : null}
                  </div>
                </div>
                {orderedStatOptions.map((option) => {
                  const checked = row.selectedStats.includes(option.key);
                  const atMaximum = row.selectedStats.length >= 4;
                  return (
                    <div
                      key={option.key}
                      className={`${styles.statToggle} ${draggedStatKey === option.key ? styles.statColumnDragging : ""} ${draggedStatKey && dragOverStatKey === option.key ? styles.statColumnDropTarget : ""}`}
                      data-personnel-stat-cell-id={`${row.id}-${option.key}`}
                    >
                      <label className={styles.statCheckbox}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!row.personId || (!checked && atMaximum)}
                          onChange={() => updateRow(index, (currentRow) => togglePersonnelRowStat(currentRow, option.key))}
                        />
                        <span>{option.label}</span>
                      </label>
                      <input
                        type="text"
                        className={styles.statValueInput}
                        value={getRowStatInputValue(row, option.key)}
                        disabled={!row.personId}
                        inputMode="decimal"
                        onChange={(event) => handleStatOverrideChange(index, option.key, event.target.value)}
                        aria-label={`${option.label} value for ${rosterById[row.personId]?.fullName || row.fullName || `slot ${index + 1}`}`}
                      />
                    </div>
                  );
                })}
                <button
                  type="button"
                  className={styles.popupButton}
                  onClick={() => setDialog({ type: "tags", rowIndex: index })}
                  disabled={!row.personId}
                >
                  <span>{row.tags.length ? `Tags (${row.tags.length})` : "Tags"}</span>
                  <span aria-hidden="true">▾</span>
                </button>
                <button
                  type="button"
                  className={`${styles.popupButton} ${styles.colorButton}`}
                  onClick={() => setDialog({ type: "color", rowIndex: index })}
                  disabled={!row.personId}
                  title={selectedColor.label}
                  aria-label={`3P color: ${selectedColor.label}`}
                >
                  <span className={styles.colorSwatch} style={{ background: selectedColor.color }} aria-hidden="true" />
                  <span aria-hidden="true">▾</span>
                </button>
              </div>
            );
          })}
          <div className={styles.bulkRow} role="row">
            <label className={styles.rowToggle} title={allPopulatedRowsEnabled ? "Deselect all players" : "Select all players"}>
              <input
                type="checkbox"
                checked={allPopulatedRowsEnabled}
                disabled={!populatedRows.length}
                onChange={handleToggleAllRows}
                aria-label={allPopulatedRowsEnabled ? "Deselect all players" : "Select all players"}
              />
            </label>
            <span className={styles.bulkLabel}>{allPopulatedRowsEnabled ? "Deselect All" : "Select All"}</span>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <div className={styles.status}>
          {status || autoSaveStatus || (teamId
            ? `${selectedValidation.rows.length} selected · exactly 4 stats required per exported player`
            : "Choose a team to begin")}
          {recordId && status.startsWith("Saved") ? (
            <> · <Link to="/me?tab=graphics">View in My Vault</Link></>
          ) : null}
        </div>
        <div className={styles.actionGroup}>
          {recordId ? (
            <button type="button" className={styles.secondaryButton} onClick={handleDelete} disabled={Boolean(busyAction)}>
              Delete
            </button>
          ) : null}
          <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={!teamId || Boolean(busyAction)}>
            {busyAction === "save" ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            className={exportMode === "all" ? styles.exportAllButton : styles.secondaryButton}
            onClick={() => handleExport(exportMode)}
            disabled={!exportReady || Boolean(busyAction)}
            title={exportButtonTitle}
          >
            {busyAction?.startsWith("export-") ? "Exporting..." : exportButtonLabel}
          </button>
        </div>
      </div>

      <Dialog
        open={Boolean(dialog && activeDialogRow)}
        title={dialog?.type === "tags" ? "Personnel Tags" : "3P Bar Color"}
        kicker={activeDialogRow ? (rosterById[activeDialogRow.personId]?.fullName || activeDialogRow.fullName) : ""}
        onClose={() => setDialog(null)}
        width="600px"
      >
        {dialog?.type === "tags" ? (
          <>
            <p className={styles.dialogHint}>Select any tags to place below this player&apos;s 3P bar.</p>
            <div className={styles.dialogGrid}>
              {PERSONNEL_TAG_OPTIONS.map((option) => (
                <label key={option.key} className={styles.dialogOption}>
                  <input
                    type="checkbox"
                    checked={activeDialogRow?.tags.includes(option.key) || false}
                    onChange={() => handleToggleTag(dialog.rowIndex, option.key)}
                  />
                  <img className={styles.tagPreview} src={TAG_IMAGE_URLS[option.key]} alt="" />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className={styles.dialogHint}>Choose one color. Fill length always comes from 3PA ÷ FGA.</p>
            <div className={`${styles.dialogGrid} ${styles.colorDialogGrid}`}>
              {PERSONNEL_THREE_POINT_COLOR_OPTIONS.map((option) => (
                <label key={option.key} className={`${styles.dialogOption} ${styles.colorDialogOption}`} title={option.label}>
                  <input
                    type="checkbox"
                    checked={currentColor?.key === option.key}
                    onChange={() => updateRow(dialog.rowIndex, {
                      threePointColor: option.key,
                      threePointColorEdited: true,
                    }, { autoSaveTagsAndColors: true })}
                    aria-label={option.label}
                  />
                  <span className={styles.dialogColorSwatch} style={{ background: option.color }} aria-hidden="true" />
                </label>
              ))}
            </div>
          </>
        )}
      </Dialog>
      </div>
    </div>
  );
}
