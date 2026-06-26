import { useQuery } from "@tanstack/react-query";
import {
  fetchGame,
  fetchGamesByDate,
  fetchMinutes,
  fetchTeamSeasonGames,
} from "./api.js";

const normalizeKeyValue = (value, fallback = "all") => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

export const queryKeys = {
  gamesByDate: (dateInput) => ["games", normalizeKeyValue(dateInput)],
  teamSeasonGames: (teamId, opponentTeamId = "", season = "") => [
    "teamSeasonGames",
    normalizeKeyValue(teamId),
    normalizeKeyValue(opponentTeamId, "all-opponents"),
    normalizeKeyValue(season, "current"),
  ],
  game: (gameId, segment = null) => [
    "game",
    normalizeKeyValue(gameId),
    normalizeKeyValue(segment),
  ],
  minutes: (gameId) => ["minutes", normalizeKeyValue(gameId)],
};

export function useGamesByDate(dateInput, options = {}) {
  return useQuery(gamesByDateQueryOptions(dateInput, options));
}

export function gamesByDateQueryOptions(dateInput, options = {}) {
  return {
    queryKey: queryKeys.gamesByDate(dateInput),
    queryFn: () => fetchGamesByDate(dateInput),
    enabled: Boolean(dateInput) && (options.enabled ?? true),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    ...options,
  };
}

export function useTeamSeasonGames(teamId, opponentTeamId = "", season = "", options = {}) {
  return useQuery(teamSeasonGamesQueryOptions(teamId, opponentTeamId, season, options));
}

export function teamSeasonGamesQueryOptions(teamId, opponentTeamId = "", season = "", options = {}) {
  return {
    queryKey: queryKeys.teamSeasonGames(teamId, opponentTeamId, season),
    queryFn: () => fetchTeamSeasonGames(teamId, opponentTeamId, season),
    enabled: Boolean(teamId) && (options.enabled ?? true),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    ...options,
  };
}

export function useGame(gameId, options = {}) {
  return useQuery(gameQueryOptions(gameId, options));
}

export function gameQueryOptions(gameId, options = {}) {
  const {
    segment = null,
    dateStr = null,
    ...queryOptions
  } = options;

  return {
    queryKey: queryKeys.game(gameId, segment),
    queryFn: () => fetchGame(gameId, segment, { dateStr }),
    enabled: Boolean(gameId) && (queryOptions.enabled ?? true),
    staleTime: 30_000,
    ...queryOptions,
  };
}

export function useMinutes(gameId, options = {}) {
  return useQuery(minutesQueryOptions(gameId, options));
}

export function minutesQueryOptions(gameId, options = {}) {
  const {
    optional = false,
    ...queryOptions
  } = options;

  return {
    queryKey: queryKeys.minutes(gameId),
    queryFn: () => fetchMinutes(gameId, { optional }),
    enabled: Boolean(gameId) && (queryOptions.enabled ?? true),
    ...queryOptions,
  };
}
