import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchGamesByDate } from "../api.js";
import { formatDateInput, formatDateLabel, parseDateInput } from "../utils.js";
import GameCard from "./GameCard.jsx";
import styles from "./Header.module.css";

export default function Header({ theme, onToggleTheme }) {
  const [params, setParams] = useSearchParams();
  const inputRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);

  const dateParam = params.get("d");
  const date = dateParam ? parseDateInput(dateParam) : new Date();
  const dateInput = formatDateInput(date);
  const dateLabel = formatDateLabel(date);

  const { data: games = [] } = useQuery({
    queryKey: ["headerGames", dateInput],
    queryFn: () => fetchGamesByDate(dateInput),
    refetchInterval: (query) =>
      query.state.data?.some((g) => g.gameStatus === 2) ? 30_000 : false,
  });

  const orderedGames = useMemo(() => {
    return [...games].sort((a, b) => {
      const aPriority = a.homeTeam.teamTricode === "POR" || a.awayTeam.teamTricode === "POR";
      const bPriority = b.homeTeam.teamTricode === "POR" || b.awayTeam.teamTricode === "POR";
      if (aPriority && !bPriority) return -1;
      if (!aPriority && bPriority) return 1;
      return 0;
    });
  }, [games]);

  const handleDateChange = (event) => {
    const nextValue = event.target.value;
    if (!nextValue) return;
    const nextParams = new URLSearchParams(params);
    nextParams.set("d", nextValue);
    setParams(nextParams);
    setIsOpen(false);
  };

  const openPicker = () => {
    setIsOpen(true);
    inputRef.current?.showPicker?.();
    inputRef.current?.focus();
  };

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.modeGroup}>
          <span className={styles.modeLabel}>Mode</span>
          <button className={styles.themeToggle} onClick={onToggleTheme} type="button" aria-label="Toggle theme">
            {theme === "dark" ? "☾" : "☀"}
          </button>
        </div>

        <Link to="/" className={styles.logoLink}>
          <div className={styles.logo}>
            <div>Live</div>
            <div className={styles.logoLine2}>Stats</div>
          </div>
        </Link>
        <div className={styles.datePickerWrapper}>
          {isOpen && <div className={styles.backdrop} onClick={() => setIsOpen(false)} />}
          <button className={styles.dateButton} onClick={openPicker} type="button">
            {dateLabel}
          </button>
          <input
            ref={inputRef}
            className={styles.hiddenDateInput}
            type="date"
            value={dateInput}
            onChange={handleDateChange}
            onBlur={() => setIsOpen(false)}
          />
        </div>

        <div className={styles.gamesWrapper}>
          <div className={styles.gamesList}>
            {orderedGames.length === 0 ? (
              <div className={styles.noGames}>No games scheduled</div>
            ) : (
              orderedGames.map((game) => <GameCard key={game.gameId} game={game} />)
            )}
          </div>
        </div>

      </div>
    </header>
  );
}
