import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchGame } from "../api.js";
import { isCapitalCityTeam, isWashingtonTeam } from "../pregamePlayers.js";
import { supabase } from "../supabaseClient.js";
import { readLocalStorage, writeLocalStorage } from "../storage.js";
import styles from "./Kpis.module.css";

const KPI_STORAGE_PREFIX = "kpis:game:v1:";
const KPI_SHARED_TABLE = "rotations_shared_state";
const KPI_SCOPE_TYPE = "shared_game_kpis";
const STAGE_WIDTH = 3840;
const STAGE_HEIGHT = 2160;
const DEFAULT_METRICS = [
  { id: "kpi-1", name: "KPI #1", value: "50", nameUpdatedAt: 0, valueUpdatedAt: 0 },
  { id: "kpi-2", name: "KPI #2", value: "127", nameUpdatedAt: 0, valueUpdatedAt: 0 },
  { id: "kpi-3", name: "KPI #3", value: "32", nameUpdatedAt: 0, valueUpdatedAt: 0 },
];

function safeParseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeMetrics(raw, fallbackUpdatedAt = 0) {
  const metrics = Array.isArray(raw) ? raw : [];
  return DEFAULT_METRICS.map((metric, index) => {
    const candidate = metrics[index];
    return {
      id: metric.id,
      name: String(candidate?.name || metric.name),
      value: String(candidate?.value || metric.value),
      nameUpdatedAt: Number(candidate?.nameUpdatedAt || fallbackUpdatedAt || 0),
      valueUpdatedAt: Number(candidate?.valueUpdatedAt || fallbackUpdatedAt || 0),
    };
  });
}

function payloadStateKey(payload) {
  return JSON.stringify(payload || {});
}

function normalizeMetricsPayload(raw) {
  if (Array.isArray(raw)) {
    return {
      updatedAt: 0,
      metrics: normalizeMetrics(raw, 0),
    };
  }

  const updatedAt = Number(raw?.updatedAt || 0);
  return {
    updatedAt,
    metrics: normalizeMetrics(raw?.metrics, updatedAt),
  };
}

function loadStoredMetricsPayload(gameId) {
  return normalizeMetricsPayload(
    safeParseJson(readLocalStorage(`${KPI_STORAGE_PREFIX}${gameId}`) || "null", { updatedAt: 0, metrics: DEFAULT_METRICS })
  );
}

function persistMetricsPayload(gameId, payload) {
  if (!gameId) return;
  writeLocalStorage(`${KPI_STORAGE_PREFIX}${gameId}`, JSON.stringify(payload));
}

function mergeMetricEntry(localMetric, remoteMetric) {
  const localNameUpdatedAt = Number(localMetric?.nameUpdatedAt || 0);
  const remoteNameUpdatedAt = Number(remoteMetric?.nameUpdatedAt || 0);
  const localValueUpdatedAt = Number(localMetric?.valueUpdatedAt || 0);
  const remoteValueUpdatedAt = Number(remoteMetric?.valueUpdatedAt || 0);

  const useRemoteName = remoteNameUpdatedAt > localNameUpdatedAt;
  const useRemoteValue = remoteValueUpdatedAt > localValueUpdatedAt;

  return {
    id: String(localMetric?.id || remoteMetric?.id || crypto.randomUUID()),
    name: String(useRemoteName ? remoteMetric?.name : localMetric?.name || ""),
    value: String(useRemoteValue ? remoteMetric?.value : localMetric?.value || ""),
    nameUpdatedAt: Math.max(localNameUpdatedAt, remoteNameUpdatedAt),
    valueUpdatedAt: Math.max(localValueUpdatedAt, remoteValueUpdatedAt),
  };
}

function mergeMetricsPayload(localPayload, remotePayload) {
  const normalizedLocal = normalizeMetricsPayload(localPayload);
  const normalizedRemote = normalizeMetricsPayload(remotePayload);
  const metrics = DEFAULT_METRICS.map((metric, index) => mergeMetricEntry(
    normalizedLocal.metrics[index] || metric,
    normalizedRemote.metrics[index] || metric
  ));
  const updatedAt = Math.max(
    normalizedLocal.updatedAt || 0,
    normalizedRemote.updatedAt || 0,
    ...metrics.flatMap((metric) => [metric.nameUpdatedAt, metric.valueUpdatedAt])
  );
  return { updatedAt, metrics };
}

async function fetchRemoteMetricsPayload(gameId) {
  if (!supabase || !gameId) return null;
  const { data, error } = await supabase
    .from(KPI_SHARED_TABLE)
    .select("payload,updated_at")
    .eq("scope_type", KPI_SCOPE_TYPE)
    .eq("scope_key", String(gameId))
    .maybeSingle();
  if (error || !data?.payload) return null;
  return normalizeMetricsPayload({
    updatedAt: data?.updated_at ? new Date(data.updated_at).getTime() : Number(data?.payload?.updatedAt || 0),
    metrics: data?.payload?.metrics,
  });
}

async function saveRemoteMetricsPayload(gameId, payload) {
  if (!supabase || !gameId) return payload;
  const remotePayload = await fetchRemoteMetricsPayload(gameId);
  const merged = mergeMetricsPayload(payload, remotePayload);
  const { error } = await supabase.from(KPI_SHARED_TABLE).upsert(
    {
      scope_type: KPI_SCOPE_TYPE,
      scope_key: String(gameId),
      payload: merged,
    },
    { onConflict: "scope_type,scope_key" }
  );
  if (error) throw error;
  return merged;
}

export default function Kpis() {
  const { gameId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get("d") || "";
  const [metricsPayload, setMetricsPayload] = useState(() => loadStoredMetricsPayload(gameId));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stageScale, setStageScale] = useState(1);
  const [syncError, setSyncError] = useState("");
  const fullscreenRootRef = useRef(null);
  const metricsStateKeyRef = useRef(payloadStateKey(loadStoredMetricsPayload(gameId)));
  const skipNextSaveRef = useRef(false);
  const hydratedRef = useRef(false);

  const { data: game, isLoading, error } = useQuery({
    queryKey: ["game-kpis", gameId],
    queryFn: () => fetchGame(gameId),
    enabled: Boolean(gameId),
  });

  const supportedTeamGame = useMemo(() => {
    const homeTeam = game?.homeTeam;
    const awayTeam = game?.awayTeam;
    return isWashingtonTeam(homeTeam) || isWashingtonTeam(awayTeam) || isCapitalCityTeam(homeTeam) || isCapitalCityTeam(awayTeam);
  }, [game]);

  const backUrl = dateParam ? `/g/${gameId}?d=${dateParam}` : `/g/${gameId}`;
  const titleLine = useMemo(() => {
    const away = game?.awayTeam?.teamTricode || game?.awayTeam?.teamName || "";
    const home = game?.homeTeam?.teamTricode || game?.homeTeam?.teamName || "";
    if (!away || !home) return "Game KPIs";
    return `${away} at ${home} KPIs`;
  }, [game]);

  useEffect(() => {
    const nextPayload = loadStoredMetricsPayload(gameId);
    metricsStateKeyRef.current = payloadStateKey(nextPayload);
    skipNextSaveRef.current = true;
    hydratedRef.current = true;
    setMetricsPayload(nextPayload);
  }, [gameId]);

  useEffect(() => {
    persistMetricsPayload(gameId, metricsPayload);
    metricsStateKeyRef.current = payloadStateKey(metricsPayload);
  }, [gameId, metricsPayload]);

  useEffect(() => {
    if (!gameId) return undefined;
    let cancelled = false;

    const applyIncomingPayload = (incomingPayload) => {
      if (!incomingPayload) return;
      setMetricsPayload((current) => {
        const merged = mergeMetricsPayload(current, incomingPayload);
        const mergedKey = payloadStateKey(merged);
        if (mergedKey === metricsStateKeyRef.current) return current;
        skipNextSaveRef.current = true;
        metricsStateKeyRef.current = mergedKey;
        persistMetricsPayload(gameId, merged);
        return merged;
      });
    };

    fetchRemoteMetricsPayload(gameId)
      .then((payload) => {
        if (cancelled || !payload) return;
        applyIncomingPayload(payload);
      })
      .catch(() => {});

    if (!supabase) {
      return () => {
        cancelled = true;
      };
    }

    const channel = supabase
      .channel(`kpis-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: KPI_SHARED_TABLE,
          filter: `scope_type=eq.${KPI_SCOPE_TYPE}`,
        },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row || row.scope_key !== String(gameId)) return;
          applyIncomingPayload(normalizeMetricsPayload(row.payload));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  useEffect(() => {
    const updateFullscreenState = () => {
      const nextIsFullscreen = document.fullscreenElement === fullscreenRootRef.current;
      setIsFullscreen(nextIsFullscreen);
    };
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      setStageScale(1);
      return undefined;
    }

    const updateScale = () => {
      const viewportWidth = window.innerWidth || STAGE_WIDTH;
      const viewportHeight = window.innerHeight || STAGE_HEIGHT;
      setStageScale(Math.min(viewportWidth / STAGE_WIDTH, viewportHeight / STAGE_HEIGHT));
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [isFullscreen]);

  const updateMetric = (metricId, field, value) => {
    const timestamp = Date.now();
    setMetricsPayload((current) => ({
      updatedAt: timestamp,
      metrics: current.metrics.map((metric) => {
        if (metric.id !== metricId) return metric;
        if (field === "name") {
          return { ...metric, name: value, nameUpdatedAt: timestamp };
        }
        return { ...metric, value, valueUpdatedAt: timestamp };
      }),
    }));
  };

  useEffect(() => {
    if (!gameId || !hydratedRef.current) return undefined;

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      saveRemoteMetricsPayload(gameId, metricsPayload)
        .then((savedPayload) => {
          setSyncError("");
          const savedKey = payloadStateKey(savedPayload);
          if (savedKey === metricsStateKeyRef.current) return;
          skipNextSaveRef.current = true;
          metricsStateKeyRef.current = savedKey;
          setMetricsPayload(savedPayload);
        })
        .catch((saveError) => {
          console.error("Failed to save KPI state.", saveError);
          setSyncError(saveError?.message || "Unable to sync KPI changes.");
        });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [gameId, metricsPayload]);

  const handleEnterFullscreen = async () => {
    const element = fullscreenRootRef.current;
    if (!element) return;
    try {
      if (document.fullscreenElement === element) {
        await document.exitFullscreen();
        return;
      }
      await element.requestFullscreen();
    } catch (fullscreenError) {
      console.error("Unable to toggle KPI fullscreen mode.", fullscreenError);
    }
  };

  if (isLoading) {
    return <div className={styles.stateMessage}>Loading KPI page...</div>;
  }

  if (error || !game) {
    return <div className={styles.stateMessage}>Unable to load KPI page.</div>;
  }

  if (!supportedTeamGame) {
    return (
      <div className={styles.page}>
        <div className={styles.topRow}>
          <Link className={styles.backButton} to={backUrl}>Back</Link>
        </div>
        <div className={styles.stateMessage}>KPIs are available only for Washington and Capital City games.</div>
      </div>
    );
  }

  return (
    <div
      ref={fullscreenRootRef}
      className={`${styles.page} ${isFullscreen ? styles.pageFullscreen : ""}`}
    >
      {!isFullscreen ? (
        <>
          <div className={styles.topRow}>
            <div className={styles.topRowLeft}>
              <Link className={styles.backButton} to={backUrl}>Back</Link>
            </div>
            <button type="button" className={styles.fullscreenButton} onClick={handleEnterFullscreen}>
              Full Screen
            </button>
          </div>

          <div className={styles.headerBlock}>
            <div className={styles.eyebrow}>KPI Dashboard</div>
            <h1 className={styles.title}>{titleLine}</h1>
            {syncError ? <p className={styles.syncError}>Sync issue: {syncError}</p> : null}
          </div>

          <div className={styles.editorGrid}>
            {metricsPayload.metrics.map((metric, index) => (
              <section key={metric.id} className={styles.metricCard}>
                <div className={styles.metricCardHeader}>Metric {index + 1}</div>
                <label className={styles.fieldLabel}>
                  Name
                  <input
                    className={styles.textInput}
                    type="text"
                    value={metric.name}
                    onChange={(event) => updateMetric(metric.id, "name", event.target.value)}
                    placeholder={`KPI #${index + 1}`}
                  />
                </label>
                <label className={styles.fieldLabel}>
                  Value
                  <input
                    className={styles.textInput}
                    type="text"
                    value={metric.value}
                    onChange={(event) => updateMetric(metric.id, "value", event.target.value)}
                    placeholder="0"
                    inputMode="numeric"
                  />
                </label>
              </section>
            ))}
          </div>
        </>
      ) : null}

      {isFullscreen ? (
        <>
          <button type="button" className={styles.exitFullscreenButton} onClick={handleEnterFullscreen}>
            Exit Full Screen
          </button>
          <div className={styles.fullscreenViewport}>
            <div
              className={styles.fullscreenStage}
              style={{
                width: `${STAGE_WIDTH}px`,
                height: `${STAGE_HEIGHT}px`,
                transform: `scale(${stageScale})`,
              }}
            >
              <div className={styles.contentBox}>
                <div className={styles.contentColumn}>
                  {metricsPayload.metrics.map((metric) => (
                    <section key={metric.id} className={styles.displayMetric}>
                      <div className={styles.displayMetricName}>{metric.name || " "}</div>
                      <div className={styles.displayMetricValueBox}>
                        <div className={styles.displayMetricValue}>{metric.value || " "}</div>
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
