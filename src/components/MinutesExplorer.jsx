import { useMemo, useState } from "react";
import { buildCombos, durationLabel, playerTimeline, signed } from "../minutesExplorer.js";
import styles from "../pages/Minutes.module.css";

const number = (value) => value == null ? "—" : value.toFixed(1);
const marginColor = (value) => value === 0 ? "#626b76" : value > 0
  ? `hsl(145 55% ${Math.max(28, 48 - Math.abs(value))}%)`
  : `hsl(0 65% ${Math.max(30, 52 - Math.abs(value))}%)`;

export function MinutesTimeline({ model, data, vantage }) {
  const sides = vantage === "neutral" ? ["away", "home"] : [vantage];
  const ticks = Array.from({ length: Math.floor(model.totalSeconds / 360) + 1 }, (_, index) => index * 360);
  if (ticks.at(-1) !== model.totalSeconds) ticks.push(model.totalSeconds);
  return <section className={styles.explorerPanel} aria-label="Player rotation timeline">
    <h2>Player Game Rotation <span>(Plus/Minus)</span></h2>
    <p className={styles.explorerHelp}>Each bar is an uninterrupted appearance within a period. Values show that team’s scoring margin while the player was on court, calculated from verified play-by-play when available. Hover or focus a bar for details.</p>
    {model.issues.length > 0 && <p className={styles.dataWarning}>Feed verification warning: {model.issues.join(" ")} Timeline bars reflect the available minutes feed.</p>}
    <div className={styles.legend}><span>Negative</span><i /><span>Positive</span></div>
    <div className={styles.timelineScroll}>
      <div className={styles.timeline}>
        {sides.map((side) => <div key={side}>
          <h3>{data[`${side}Team`].teamTricode || data[`${side}Team`].teamName}</h3>
          {playerTimeline(model, side).map((player) => <div className={styles.timelineRow} key={player.personId}>
            <div className={styles.timelineName}>{player.nameI}</div>
            <div className={styles.timelineTrack}>
              {model.records.filter((row, index, all) => index === 0 || row.period !== all[index - 1].period).map((row) => <span key={row.period} className={styles.periodMarker} style={{ left: `${row.start / model.totalSeconds * 100}%` }} />)}
              {player.intervals.filter((interval) => interval.end > interval.start).map((interval, index) => {
                const label = `${player.nameI}, ${interval.period > 4 ? `OT${interval.period - 4}` : `Q${interval.period}`} ${interval.startClock}–${interval.endClock}, ${signed(interval.margin)}, ${durationLabel(interval.end - interval.start)}`;
                return <button key={index} type="button" className={styles.timelineBar} title={label} aria-label={label}
                  style={{ left: `${interval.start / model.totalSeconds * 100}%`, width: `${(interval.end - interval.start) / model.totalSeconds * 100}%`, background: marginColor(interval.margin) }}>
                  {interval.end - interval.start >= 55 ? signed(interval.margin) : ""}
                </button>;
              })}
            </div>
          </div>)}
        </div>)}
        <div className={styles.timelineRow}><div className={styles.timelineName}>Elapsed minutes</div><div className={styles.timelineAxis}>
          {ticks.map((tick) => <span key={tick} style={{ left: `${tick / model.totalSeconds * 100}%` }}>{Math.round(tick / 60)}</span>)}
        </div></div>
      </div>
    </div>
  </section>;
}

export function MinutesCombos({ model, data, side }) {
  const [selected, setSelected] = useState([]);
  const rows = useMemo(() => buildCombos(model, side, selected), [model, side, selected]);
  const players = model.rosters[side];
  const toggle = (playerId) => setSelected((previous) => previous.includes(playerId)
    ? previous.filter((value) => value !== playerId) : previous.length < 4 ? [...previous, playerId] : previous);
  return <section className={styles.explorerPanel} aria-label="Player combinations">
    <h2>{data[`${side}Team`].teamTricode || data[`${side}Team`].teamName} Player Combos</h2>
    <p className={styles.explorerHelp}>Select up to four players to compare every on/off combination. “Off” means the selected player was on the bench; the other roster spots can contain any teammates. Samples under 3 minutes are marked small.</p>
    <div className={styles.playerChoices}>
      {players.map((player) => <button key={player.personId} type="button" aria-pressed={selected.includes(String(player.personId))}
        disabled={selected.length >= 4 && !selected.includes(String(player.personId))}
        className={`${styles.playerChoice} ${selected.includes(String(player.personId)) ? styles.viewButtonActive : ""}`}
        onClick={() => toggle(String(player.personId))}>{player.nameI}</button>)}
      {selected.length > 0 && <button className={styles.viewButton} type="button" onClick={() => setSelected([])}>Clear</button>}
    </div>
    {model.issues.length > 0 ? <div role="status" className={styles.dataWarning}>Combination statistics unavailable until the feeds reconcile.<ul>{model.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>
      : !selected.length ? <p className={styles.explorerHelp}>Select players above to calculate their combinations.</p>
        : <div className={styles.comboScroll}><table className={styles.comboTable}>
          <caption>{selected.length} selected · {rows.length} combinations · {data[`${side}Team`].teamTricode} perspective</caption>
          <thead><tr><th>On / Off</th><th>MIN</th><th title="Estimated offensive possessions: FGA + 0.44 × FTA − player OREB + TOV">POSS (est.)</th><th>+/−</th><th>ORTG</th><th>DRTG</th><th>NET</th><th>EFG%</th><th>OPP EFG%</th><th>TOV%</th><th>OPP TOV%</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.mask}>
            <th scope="row"><div className={styles.comboNames}>{selected.map((playerId, index) => {
              const on = Boolean(row.mask & (1 << index));
              return <span key={playerId} className={on ? styles.playerOn : styles.playerOff}>{players.find((player) => String(player.personId) === playerId)?.nameI} <small>{on ? "ON" : "OFF"}</small></span>;
            })}</div>{row.seconds < 180 && <small className={styles.smallSample}>{row.seconds ? "Small sample" : "No elapsed minutes"}</small>}</th>
            <td>{durationLabel(row.seconds)}</td><td>{number(row.possessions)}</td>
            <td className={row.plusMinus > 0 ? styles.valuePositive : row.plusMinus < 0 ? styles.valueNegative : ""}>{signed(row.plusMinus)}</td>
            <td>{number(row.ortg)}</td><td>{number(row.drtg)}</td><td className={row.net > 0 ? styles.valuePositive : row.net < 0 ? styles.valueNegative : ""}>{row.net == null ? "—" : `${row.net > 0 ? "+" : ""}${number(row.net)}`}</td>
            <td>{number(row.efg)}</td><td>{number(row.opponentEfg)}</td><td>{number(row.tov)}</td><td>{number(row.opponentTov)}</td>
          </tr>)}</tbody>
        </table></div>}
    <details className={styles.formulas}><summary>Calculation definitions</summary>
      <p>Possessions = FGA + 0.44 × FTA − player offensive rebounds + turnovers. ORTG = points scored per 100 estimated offensive possessions; DRTG uses opponent points and opponent estimated possessions. NET = ORTG − DRTG. EFG% = (FGM + 0.5 × 3PM) / FGA. TOV% = TOV / (FGA + 0.44 × FTA + TOV). Opponent percentages use the same definitions. Rates are calculated from combined event totals, not averages of stint ratings. Scoring at substitution-clock boundaries is reconciled to the minutes feed’s interval scores and player box-score plus/minus; non-scoring events use substitution order as a tie-breaker. A dash means the denominator is zero. These estimates can be noisy for short appearances, particularly when a possession spans a substitution.</p>
    </details>
  </section>;
}
