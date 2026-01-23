import styles from "./CreatingDisruption.module.css";

function formatPair(made, attempted) {
  return `${made || 0}/${attempted || 0}`;
}

export default function CreatingDisruption({
  awayLabel,
  homeLabel,
  awayStats,
  homeStats,
  awayDisruptions,
  homeDisruptions,
  awayKills,
  homeKills,
}) {
  if (!awayStats || !homeStats) return null;

  return (
    <section className={styles.container}>
      <h3 className={styles.title}>Creating & Disruption</h3>
      <div className={styles.grid}>
        <div className={styles.header}></div>
        <div className={styles.header}>{awayLabel}</div>
        <div className={styles.header}>{homeLabel}</div>

        <div className={styles.label}>Driving</div>
        <div>{formatPair(awayStats.drivingFGMade, awayStats.drivingFGAttempted)}</div>
        <div>{formatPair(homeStats.drivingFGMade, homeStats.drivingFGAttempted)}</div>

        <div className={styles.label}>Cutting</div>
        <div>{formatPair(awayStats.cuttingFGMade, awayStats.cuttingFGAttempted)}</div>
        <div>{formatPair(homeStats.cuttingFGMade, homeStats.cuttingFGAttempted)}</div>

        <div className={styles.label}>Catch & Shoot 3s</div>
        <div>{formatPair(awayStats.catchAndShoot3FGMade, awayStats.catchAndShoot3FGAttempted)}</div>
        <div>{formatPair(homeStats.catchAndShoot3FGMade, homeStats.catchAndShoot3FGAttempted)}</div>

        <div className={styles.label}>Dynamite 3FGAs</div>
        <div>{formatPair(awayStats.secondChance3FGMade, awayStats.secondChance3FGAttempted)}</div>
        <div>{formatPair(homeStats.secondChance3FGMade, homeStats.secondChance3FGAttempted)}</div>

        <div className={styles.label}>Offensive Fouls Drawn</div>
        <div>{awayStats.offensiveFoulsDrawn ?? 0}</div>
        <div>{homeStats.offensiveFoulsDrawn ?? 0}</div>

        <div className={styles.label}>Disruptions</div>
        <div>{awayDisruptions ?? 0}</div>
        <div>{homeDisruptions ?? 0}</div>

        <div className={styles.label}>Kills</div>
        <div>{awayKills ?? 0}</div>
        <div>{homeKills ?? 0}</div>
      </div>
    </section>
  );
}
