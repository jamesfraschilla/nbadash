import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchGamesByDate, fetchTeamSeasonGames, teamLogoUrl } from "../api.js";
import { NBA_TEAMS } from "../data/nbaTeams.js";
import {
  formatDateInput,
  formatDateInputInTimeZone,
  formatDateLabel,
  formatGameDateLabel,
  gameStatusLabel,
  normalizeClock,
  parseDateInput,
} from "../utils.js";
import styles from "./Home.module.css";

export default function Home() {
  const [params, setParams] = useSearchParams();
  const dateParam = params.get("d");
  const selectedTeamId = params.get("team") || "";
  const selectedOpponentTeamId = params.get("opponent") || "";
  const dateInput = dateParam || formatDateInputInTimeZone(new Date(), "America/New_York");
  const date = parseDateInput(dateInput);
  const dateLabel = formatDateLabel(date);
  const selectedTeam = NBA_TEAMS.find((team) => team.teamId === selectedTeamId) || null;
  const selectedOpponentTeam = NBA_TEAMS.find((team) => team.teamId === selectedOpponentTeamId) || null;

  function changeDateBy(deltaDays) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + deltaDays);
    const nextParams = new URLSearchParams(params);
    nextParams.set("d", formatDateInput(next));
    setParams(nextParams);
  }

  function handleTeamChange(event) {
    const nextTeamId = event.target.value;
    const nextParams = new URLSearchParams(params);
    if (nextTeamId) {
      nextParams.set("team", nextTeamId);
    } else {
      nextParams.delete("team");
    }
    nextParams.delete("opponent");
    setParams(nextParams);
  }

  function handleOpponentChange(event) {
    const nextOpponentTeamId = event.target.value;
    const nextParams = new URLSearchParams(params);
    if (nextOpponentTeamId) {
      nextParams.set("opponent", nextOpponentTeamId);
    } else {
      nextParams.delete("opponent");
    }
    setParams(nextParams);
  }

  function clearTeamFilter() {
    const nextParams = new URLSearchParams(params);
    nextParams.delete("team");
    nextParams.delete("opponent");
    setParams(nextParams);
  }

  function clearOpponentFilter() {
    const nextParams = new URLSearchParams(params);
    nextParams.delete("opponent");
    setParams(nextParams);
  }

  const { data: games = [], isLoading, error } = useQuery({
    queryKey: selectedTeamId ? ["teamSeasonGames", selectedTeamId, selectedOpponentTeamId] : ["games", dateInput],
    queryFn: () => (selectedTeamId
      ? fetchTeamSeasonGames(selectedTeamId, selectedOpponentTeamId)
      : fetchGamesByDate(dateInput)),
    staleTime: selectedTeamId ? 5 * 60 * 1000 : 30_000,
    refetchOnWindowFocus: false,
  });

  const { nbaGames, gLeagueGames } = useMemo(() => {
    if (selectedTeamId) {
      return { nbaGames: games, gLeagueGames: [] };
    }
    const nba = [];
    const gLeague = [];
    games.forEach((game) => {
      const id = String(game.gameId || "");
      if (id.startsWith("202")) {
        gLeague.push(game);
      } else {
        nba.push(game);
      }
    });
    return { nbaGames: nba, gLeagueGames: gLeague };
  }, [games, selectedTeamId]);

  const renderFilters = () => (
    <>
      <div className={styles.filterControl}>
        <label className={styles.teamFilter}>
          <select
            className={styles.teamSelect}
            value={selectedTeamId}
            onChange={handleTeamChange}
            aria-label="Select team"
          >
            <option value="">Team (Select)</option>
            {NBA_TEAMS.map((team) => (
              <option key={team.teamId} value={team.teamId}>{team.fullName}</option>
            ))}
          </select>
        </label>
        {selectedTeamId ? (
          <button
            type="button"
            className={styles.clearFilterButton}
            onClick={clearTeamFilter}
            aria-label="Clear team filter"
          >
            X
          </button>
        ) : null}
      </div>
      {selectedTeamId ? (
        <div className={styles.filterControl}>
          <label className={styles.teamFilter}>
            <select
              className={styles.teamSelect}
              value={selectedOpponentTeamId}
              onChange={handleOpponentChange}
              aria-label="Select opponent"
            >
              <option value="">Opponent</option>
              {NBA_TEAMS.filter((team) => team.teamId !== selectedTeamId).map((team) => (
                <option key={`opponent-${team.teamId}`} value={team.teamId}>{team.fullName}</option>
              ))}
            </select>
          </label>
          {selectedOpponentTeamId ? (
            <button
              type="button"
              className={styles.clearFilterButton}
              onClick={clearOpponentFilter}
              aria-label="Clear opponent filter"
            >
              X
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.dateNav}>
          <button type="button" className={styles.dateButton} onClick={() => changeDateBy(-1)}>
            Prev
          </button>
          <div className={styles.dateLabel}>{dateLabel}</div>
          <button type="button" className={styles.dateButton} onClick={() => changeDateBy(1)}>
            Next
          </button>
          {renderFilters()}
        </div>
        <div className={styles.stateMessage}>
          {selectedTeamId ? "Loading team games..." : "Loading games..."}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.dateNav}>
          <button type="button" className={styles.dateButton} onClick={() => changeDateBy(-1)}>
            Prev
          </button>
          <div className={styles.dateLabel}>{dateLabel}</div>
          <button type="button" className={styles.dateButton} onClick={() => changeDateBy(1)}>
            Next
          </button>
          {renderFilters()}
        </div>
        <div className={styles.stateMessage}>
          {selectedTeamId ? "Failed to load team games." : "Failed to load games."}
        </div>
      </div>
    );
  }

  if (!nbaGames.length && !gLeagueGames.length) {
    return (
      <div className={styles.container}>
        <div className={styles.dateNav}>
          <button type="button" className={styles.dateButton} onClick={() => changeDateBy(-1)}>
            Prev
          </button>
          <div className={styles.dateLabel}>{dateLabel}</div>
          <button type="button" className={styles.dateButton} onClick={() => changeDateBy(1)}>
            Next
          </button>
          {renderFilters()}
        </div>
        <div className={styles.stateMessage}>
          {selectedTeamId
            ? (selectedOpponentTeamId
              ? "No games found between these teams in the current season."
              : "No games found for this team in the current season.")
            : "No games scheduled for this date."}
        </div>
      </div>
    );
  }

  const renderGames = (list) =>
    list.map((game) => {
      const status = gameStatusLabel(game);
      const isLive = game.gameStatus === 2;
      const scoreVisible = game.gameStatus === 2 || game.gameStatus === 3;
      const clock = isLive ? normalizeClock(game.gameClock) : "";
      const metadata = [];

      if (selectedTeamId && game.gameDate) {
        metadata.push(formatGameDateLabel(game.gameDate));
      }
      if (selectedTeamId && game.seasonType) {
        metadata.push(game.seasonType);
      } else if (game.arena?.arenaName) {
        metadata.push(game.arena.arenaName);
      }

      const linkDateParam = selectedTeamId ? game.gameDate : dateParam;

      return (
        <Link
          key={game.gameId}
          className={styles.gameCard}
          to={`/g/${game.gameId}${linkDateParam ? `?d=${linkDateParam}` : ""}`}
        >
          <div className={styles.mainContent}>
            <div className={styles.teams}>
              {[game.awayTeam, game.homeTeam].map((team) => (
                <div key={team.teamId} className={styles.teamRow}>
                  <div
                    className={styles.teamLogo}
                    style={{ backgroundImage: `url(${teamLogoUrl(team.teamId)})` }}
                  />
                  <div className={styles.teamInfo}>
                    <div className={styles.teamHeader}>
                      <div className={styles.teamTricode}>{team.teamTricode}</div>
                      {scoreVisible && <div className={styles.score}>{team.score}</div>}
                    </div>
                    {Number.isFinite(team.wins) && Number.isFinite(team.losses) ? (
                      <div className={styles.teamRecord}>
                        {team.wins}-{team.losses}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.statusContainer}>
              {status ? (
                <div className={styles.statusStacked}>
                  <div className={`${styles.statusLabel} ${isLive ? styles.live : ""}`}>{status}</div>
                  {clock && (
                    <div className={`${styles.statusLabel} ${isLive ? styles.live : ""}`}>{clock}</div>
                  )}
                </div>
              ) : (
                <div className={styles.statusLabel}>{game.gameStatusText}</div>
              )}
            </div>
          </div>
          <div className={styles.gameInfo}>
            <span className={styles.arena}>{metadata.join(" • ")}</span>
          </div>
        </Link>
      );
    });

  return (
    <div className={styles.container}>
      <div className={styles.dateNav}>
        <button type="button" className={styles.dateButton} onClick={() => changeDateBy(-1)}>
          Prev
        </button>
        <div className={styles.dateLabel}>{dateLabel}</div>
        <button type="button" className={styles.dateButton} onClick={() => changeDateBy(1)}>
          Next
        </button>
        {renderFilters()}
      </div>
      {nbaGames.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>
            {selectedTeam
              ? `${selectedTeam.fullName}${selectedOpponentTeam ? ` vs ${selectedOpponentTeam.fullName}` : ""}`
              : "NBA"}
          </h2>
          <div className={styles.gameList}>{renderGames(nbaGames)}</div>
        </>
      )}
      {gLeagueGames.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>G League</h2>
          <div className={styles.gameList}>{renderGames(gLeagueGames)}</div>
        </>
      )}
    </div>
  );
}
