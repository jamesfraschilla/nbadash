import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { listOwnedDrawings, listOwnedNotes } from "../accountData.js";
import { useAuth } from "../auth/useAuth.js";
import { fetchGame } from "../api.js";
import styles from "./UserContent.module.css";

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

export default function UserContent() {
  const { user, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "drawings" ? "drawings" : "notes";
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [opponentFilter, setOpponentFilter] = useState("all");

  const { data: notes = [], isLoading: loadingNotes } = useQuery({
    queryKey: ["owned-notes", user?.id],
    queryFn: () => listOwnedNotes(user.id),
    enabled: Boolean(user?.id),
  });

  const { data: drawings = [], isLoading: loadingDrawings } = useQuery({
    queryKey: ["owned-drawings", user?.id],
    queryFn: () => listOwnedDrawings(user.id),
    enabled: Boolean(user?.id),
  });

  const uniqueGameIds = useMemo(() => (
    Array.from(
      new Set(
        [...notes, ...drawings]
          .map((item) => String(item?.game_id || "").trim())
          .filter(Boolean)
      )
    )
  ), [drawings, notes]);

  const gameQueries = useQueries({
    queries: uniqueGameIds.map((gameId) => ({
      queryKey: ["user-content-game", gameId],
      queryFn: () => fetchGame(gameId),
      enabled: Boolean(gameId),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const gameMetaById = useMemo(() => {
    const next = new Map();
    uniqueGameIds.forEach((gameId, index) => {
      const query = gameQueries[index];
      if (query?.data) {
        next.set(gameId, buildGameMeta(query.data));
      }
    });
    return next;
  }, [gameQueries, uniqueGameIds]);

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

  const itemMatchesFilters = (item) => {
    if (!fromDate && !toDate && opponentFilter === "all") return true;
    const meta = gameMetaById.get(String(item?.game_id || "").trim());
    if (!meta) return false;
    if (fromDate && (!meta.gameDate || meta.gameDate < fromDate)) return false;
    if (toDate && (!meta.gameDate || meta.gameDate > toDate)) return false;
    if (opponentFilter !== "all" && meta.opponentKey !== opponentFilter) return false;
    return true;
  };

  const filteredNotes = useMemo(() => notes.filter(itemMatchesFilters), [notes, fromDate, toDate, opponentFilter, gameMetaById]);
  const filteredDrawings = useMemo(
    () => drawings.filter((drawing) => {
      if (!drawing.game_id && (fromDate || toDate || opponentFilter !== "all")) {
        return false;
      }
      return itemMatchesFilters(drawing);
    }),
    [drawings, fromDate, toDate, opponentFilter, gameMetaById]
  );

  const setTab = (nextTab) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", nextTab);
    setParams(nextParams, { replace: true });
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <div className={styles.kicker}>My Account</div>
          <h1 className={styles.title}>{profile?.display_name || profile?.email || "My Saved Content"}</h1>
          <div className={styles.subtitle}>
            Review your saved notes and court drawings in one place.
          </div>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Notes</div>
            <div className={styles.statValue}>{notes.length}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Drawings</div>
            <div className={styles.statValue}>{drawings.length}</div>
          </div>
        </div>
      </section>

      <div className={styles.tabRow}>
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
      </div>

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
        </div>
        <button
          type="button"
          className={styles.clearFiltersButton}
          onClick={() => {
            setFromDate("");
            setToDate("");
            setOpponentFilter("all");
          }}
        >
          Clear Filters
        </button>
      </section>

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
                return (
                  <article key={note.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitleGroup}>
                        <div className={styles.cardTitle}>{meta?.opponentLabel || `Game ${note.game_id}`}</div>
                        <div className={styles.cardMeta}>
                          {meta?.gameDate || "Unknown date"} · {note.period_label || "--"} · {formatClock(note)} · {note.sharing_scope}
                        </div>
                      </div>
                      <Link className={styles.cardLink} to={`/g/${note.game_id}/notes`}>
                        Open Notes
                      </Link>
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
      ) : (
        <section className={styles.section}>
          {loadingDrawings ? (
            <div className={styles.emptyState}>Loading drawings...</div>
          ) : filteredDrawings.length === 0 ? (
            <div className={styles.emptyState}>You have not saved any court drawings yet.</div>
          ) : (
            <div className={styles.list}>
              {filteredDrawings.map((drawing) => {
                const meta = gameMetaById.get(String(drawing.game_id || "").trim());
                return (
                  <article key={drawing.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitleGroup}>
                        <div className={styles.cardTitle}>{drawing.title || "Untitled board"}</div>
                        <div className={styles.cardMeta}>
                          {drawing.game_id
                            ? `${meta?.opponentLabel || `Game ${drawing.game_id}`} · ${meta?.gameDate || "Unknown date"}`
                            : "General"}
                          {" · "}
                          {drawing.court_mode} court · {drawing.sharing_scope}
                        </div>
                      </div>
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
      )}
    </div>
  );
}
