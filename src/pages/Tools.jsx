import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchCurrentNbaRosters, teamLogoUrl } from "../api.js";
import { useAuth } from "../auth/useAuth.js";
import { getNbaTeam, getNbaTeamRoster, NBA_TEAMS } from "../data/nbaTeams.js";
import { deleteSavedToolRecord, getSavedToolRecord, saveToolRecord } from "../toolVault.js";
import { exportMatchupGraphic } from "./matchupGraphicExport.js";
import styles from "./Tools.module.css";

const EMPTY_PLAYER_IDS = Array(5).fill("");

function buildEmptyDraft() {
  return {
    leftTeamId: "",
    rightTeamId: "",
    leftPlayerIds: [...EMPTY_PLAYER_IDS],
    rightPlayerIds: [...EMPTY_PLAYER_IDS],
    logoTeamId: "",
  };
}

function buildDraftTitle(draft) {
  const leftTeam = getNbaTeam(draft?.leftTeamId);
  const rightTeam = getNbaTeam(draft?.rightTeamId);
  if (leftTeam && rightTeam) {
    return `${leftTeam.tricode} vs ${rightTeam.tricode} Match-Up`;
  }
  if (leftTeam || rightTeam) {
    return `${(leftTeam || rightTeam)?.tricode || "NBA"} Match-Up`;
  }
  return "Match-Up Draft";
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

function ToolColumn({
  label,
  teamId,
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
          {NBA_TEAMS.map((team) => (
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
            <label key={`${label}-player-${index}`} className={styles.field}>
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
  const { accountsEnabled, user, hasFeature } = useAuth();
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState(buildEmptyDraft);
  const [recordId, setRecordId] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const canUseTools = hasFeature("tools");
  const draftParam = String(params.get("draft") || "").trim();
  const { data: remoteRostersPayload } = useQuery({
    queryKey: ["tools-current-nba-rosters"],
    queryFn: fetchCurrentNbaRosters,
    enabled: canUseTools,
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });

  const rosterMap = useMemo(() => {
    const remoteTeams = remoteRostersPayload?.teams && typeof remoteRostersPayload.teams === "object"
      ? remoteRostersPayload.teams
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
  }, [remoteRostersPayload]);

  const leftRoster = useMemo(() => rosterMap[String(draft.leftTeamId || "")] || [], [draft.leftTeamId, rosterMap]);
  const rightRoster = useMemo(() => rosterMap[String(draft.rightTeamId || "")] || [], [draft.rightTeamId, rosterMap]);
  const leftTeam = useMemo(() => getNbaTeam(draft.leftTeamId), [draft.leftTeamId]);
  const rightTeam = useMemo(() => getNbaTeam(draft.rightTeamId), [draft.rightTeamId]);
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
    if (!draftParam || !user?.id) {
      setRecordId("");
      setDraft(buildEmptyDraft());
      setSaveStatus("");
      return;
    }

    const savedRecord = getSavedToolRecord(user.id, draftParam);
    if (!savedRecord?.payload) {
      setRecordId("");
      setDraft(buildEmptyDraft());
      setSaveStatus("");
      return;
    }

    setRecordId(savedRecord.id);
    setDraft({
      leftTeamId: String(savedRecord.payload.leftTeamId || "").trim(),
      rightTeamId: String(savedRecord.payload.rightTeamId || "").trim(),
      leftPlayerIds: [...EMPTY_PLAYER_IDS].map((_, index) => String(savedRecord.payload.leftPlayerIds?.[index] || "").trim()),
      rightPlayerIds: [...EMPTY_PLAYER_IDS].map((_, index) => String(savedRecord.payload.rightPlayerIds?.[index] || "").trim()),
      logoTeamId: String(savedRecord.payload.logoTeamId || "").trim(),
    });
    setSaveStatus(`Loaded ${savedRecord.title}`);
  }, [draftParam, user?.id]);

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

  const handleSave = () => {
    if (!user?.id) return;
    const id = recordId || crypto.randomUUID();
    const updatedAt = new Date().toISOString();
    const savedRecord = saveToolRecord(user.id, {
      id,
      type: "matchup_graphic",
      title: buildDraftTitle(draft),
      updatedAt,
      createdAt: updatedAt,
      payload: draft,
    });
    if (!savedRecord) return;
    setRecordId(savedRecord.id);
    const nextParams = new URLSearchParams(params);
    nextParams.set("draft", savedRecord.id);
    setParams(nextParams, { replace: true });
    setSaveStatus(`Saved to My Vault as ${savedRecord.title}`);
  };

  const handleDelete = () => {
    if (!user?.id || !recordId) return;
    const confirmed = window.confirm("Delete this saved match-up draft?");
    if (!confirmed) return;
    deleteSavedToolRecord(user.id, recordId);
    setRecordId("");
    setDraft(buildEmptyDraft());
    const nextParams = new URLSearchParams(params);
    nextParams.delete("draft");
    setParams(nextParams, { replace: true });
    setSaveStatus("Deleted saved draft.");
  };

  const handleReset = () => {
    const confirmed = window.confirm("Are you sure you want to reset this match-up graphic?");
    if (!confirmed) return;
    setDraft(buildEmptyDraft());
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

  const logoPreviewUrl = draft.logoTeamId ? teamLogoUrl(draft.logoTeamId, "nba") : "";

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.kicker}>Tools</div>
        <h1 className={styles.title}>Match-Up Graphic Generator</h1>
        <p className={styles.subtitle}>
          Build and save a matchup graphic, then export a 1920x1080 PNG with player headshots, default number-plus-last-name labels, and the selected logo.
        </p>
        {!remoteRostersPayload?.teams ? (
          <p className={styles.statusNote}>
            Live NBA rosters will appear here once the `nba-rosters` Supabase function is deployed. Until then, this page falls back to the bundled roster snapshot.
          </p>
        ) : null}
      </section>

      <section className={styles.workspace}>
        <div className={styles.toolGrid}>
          <ToolColumn
            label="Left"
            teamId={draft.leftTeamId}
            playerIds={draft.leftPlayerIds}
            rosterMap={rosterMap}
            onTeamChange={(nextTeamId) => handleTeamChange("left", nextTeamId)}
            onPlayerChange={(index, nextPlayerId) => handlePlayerChange("left", index, nextPlayerId)}
          />

          <ToolColumn
            label="Right"
            teamId={draft.rightTeamId}
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
              {NBA_TEAMS.map((team) => (
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
    </div>
  );
}
