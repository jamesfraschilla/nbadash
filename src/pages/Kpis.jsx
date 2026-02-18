import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { computeSecondSpectrumTeamKpis } from "../secondSpectrumKpis.js";
import styles from "./Kpis.module.css";

function extractTeamIds(markingsData) {
  const sourceKeys = ["chances", "passes", "drives", "shots", "free_throws"];
  const ids = new Set();

  sourceKeys.forEach((key) => {
    const items = Array.isArray(markingsData?.[key]) ? markingsData[key] : [];
    items.forEach((item) => {
      const teamId = item?.offTeamId;
      if (typeof teamId === "string" && teamId.length > 0) {
        ids.add(teamId);
      }
    });
  });

  return Array.from(ids);
}

function formatValue(value) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(3);
  return String(value);
}

export default function Kpis() {
  const { gameId } = useParams();
  const [params] = useSearchParams();
  const dateParam = params.get("d");
  const backToGame = dateParam ? `/g/${gameId}?d=${dateParam}` : `/g/${gameId}`;

  const [rawJson, setRawJson] = useState("");
  const [teamId, setTeamId] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const parsedData = useMemo(() => {
    if (!rawJson.trim()) return null;
    try {
      return JSON.parse(rawJson);
    } catch {
      return null;
    }
  }, [rawJson]);

  const discoveredTeamIds = useMemo(() => extractTeamIds(parsedData), [parsedData]);

  const handleCompute = () => {
    setError("");
    setResult(null);

    if (!rawJson.trim()) {
      setError("Paste a basketball-markings JSON payload first.");
      return;
    }

    let payload;
    try {
      payload = JSON.parse(rawJson);
    } catch {
      setError("JSON is invalid. Please paste a valid JSON object.");
      return;
    }

    const fallbackTeamId = discoveredTeamIds[0] || "";
    const selectedTeamId = teamId.trim() || fallbackTeamId;
    if (!selectedTeamId) {
      setError("No teamId found. Enter a teamId manually.");
      return;
    }

    try {
      const kpis = computeSecondSpectrumTeamKpis(payload, selectedTeamId);
      setResult({
        teamId: selectedTeamId,
        ...kpis,
      });
    } catch (computeError) {
      setError(computeError instanceof Error ? computeError.message : "Failed to compute KPIs.");
    }
  };

  return (
    <section className={styles.container}>
      <div className={styles.backRow}>
        <Link className={styles.backButton} to={backToGame}>
          Back to Game
        </Link>
      </div>

      <h1 className={styles.title}>KPI Test Bench</h1>
      <p className={styles.subtitle}>Paste `basketball-markings.json`, choose a team, and compute derived KPIs.</p>

      <label className={styles.label} htmlFor="kpi-json-input">
        Markings JSON
      </label>
      <textarea
        id="kpi-json-input"
        className={styles.textarea}
        value={rawJson}
        onChange={(event) => {
          setRawJson(event.target.value);
          setError("");
        }}
        placeholder='{"chances": [], "passes": [], "drives": [], "shots": [], "free_throws": []}'
      />

      <div className={styles.controlsRow}>
        <div className={styles.controlItem}>
          <label className={styles.label} htmlFor="kpi-team-id">
            Team ID
          </label>
          {discoveredTeamIds.length > 0 ? (
            <select
              id="kpi-team-id"
              className={styles.input}
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
            >
              <option value="">Auto ({discoveredTeamIds[0]})</option>
              {discoveredTeamIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="kpi-team-id"
              className={styles.input}
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              placeholder="Enter offTeamId"
            />
          )}
        </div>

        <button type="button" className={styles.computeButton} onClick={handleCompute}>
          Compute KPIs
        </button>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      {result ? (
        <div className={styles.resultsGrid}>
          <div className={styles.card}>
            <div className={styles.cardLabel}>Team ID</div>
            <div className={styles.cardValue}>{result.teamId}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>Data Through</div>
            <div className={styles.cardValue}>{result.dataThrough?.label || "-"}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>Half Court Paint Touch %</div>
            <div className={styles.cardValue}>{formatValue(result.halfCourtPaintTouchPct)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>Kick Aheads + Early Opposites</div>
            <div className={styles.cardValue}>{formatValue(result.kickAheadsAndEarlyOpposites)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>Total Passes</div>
            <div className={styles.cardValue}>{formatValue(result.totalPasses)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>Scoring Passes</div>
            <div className={styles.cardValue}>{formatValue(result.scoringPasses)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>Kickout %</div>
            <div className={styles.cardValue}>{formatValue(result.kickoutPct)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>C&S 3s</div>
            <div className={styles.cardValue}>{formatValue(result.catchAndShootThrees)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>C&S 3 Frequency %</div>
            <div className={styles.cardValue}>{formatValue(result.catchAndShootThreeFrequencyPct)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>Shot Differential</div>
            <div className={styles.cardValue}>{formatValue(result.shotDifferential)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>No-Reversal Shots</div>
            <div className={styles.cardValue}>{formatValue(result.noReversalShots)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>No-Reversal Shot Frequency</div>
            <div className={styles.cardValue}>{formatValue(result.noReversalShotFrequency)}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
