import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { isCapitalCityTeam, isWashingtonTeam } from "../pregamePlayers.js";
import { useGame } from "../queries.js";
import { supabase } from "../supabaseClient.js";
import { readLocalStorage, writeLocalStorage } from "../storage.js";
import { KpiTablesEditor } from "../components/KpiTables.jsx";
import styles from "./Kpis.module.css";

const KPI_STORAGE_PREFIX = "kpis:game:v1:";
const KPI_SHARED_TABLE = "rotations_shared_state";
const KPI_SCOPE_TYPE = "shared_game_kpis";
const KPI_TEMPLATE_KEY = "wizards:defaults";
const STAGE_WIDTH = 3840;
const STAGE_HEIGHT = 2160;
const KPI_REMOTE_SAVE_DEBOUNCE_MS = 750;
const KPI_REMOTE_POLL_INTERVAL_MS = 5000;
const KPI_REMOTE_SAVE_FAILURE_LIMIT = 2;
const KPI_REMOTE_SAVE_MIN_COOLDOWN_MS = 10_000;
const KPI_REMOTE_SAVE_MAX_COOLDOWN_MS = 2 * 60_000;
const KPI_COLOR_OPTIONS = [
  { value: "default", label: "Gray" },
  { value: "green", label: "Green" },
  { value: "yellow", label: "Yellow" },
  { value: "red", label: "Red" },
];
const KPI_COLOR_VALUES = new Set(KPI_COLOR_OPTIONS.map((option) => option.value));
const KPI_METRIC_FIELDS = ["name", "value", "detail", "color"];
const DEFAULT_METRICS = [
  { id: "kpi-1", name: "KPI #1", value: "", detail: "", color: "default", nameUpdatedAt: 0, valueUpdatedAt: 0, detailUpdatedAt: 0, colorUpdatedAt: 0 },
  { id: "kpi-2", name: "KPI #2", value: "", detail: "", color: "default", nameUpdatedAt: 0, valueUpdatedAt: 0, detailUpdatedAt: 0, colorUpdatedAt: 0 },
  { id: "kpi-3", name: "KPI #3", value: "", detail: "", color: "default", nameUpdatedAt: 0, valueUpdatedAt: 0, detailUpdatedAt: 0, colorUpdatedAt: 0 },
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
    const hasName = candidate && Object.prototype.hasOwnProperty.call(candidate, "name");
    const hasValue = candidate && Object.prototype.hasOwnProperty.call(candidate, "value");
    const hasDetail = candidate && Object.prototype.hasOwnProperty.call(candidate, "detail");
    const candidateColor = String(candidate?.color || "default").toLowerCase();
    return {
      id: metric.id,
      name: String(hasName ? candidate.name ?? "" : metric.name),
      value: String(hasValue ? candidate.value ?? "" : metric.value),
      detail: String(hasDetail ? candidate.detail ?? "" : metric.detail),
      color: KPI_COLOR_VALUES.has(candidateColor) ? candidateColor : "default",
      nameUpdatedAt: Number(candidate?.nameUpdatedAt || fallbackUpdatedAt || 0),
      valueUpdatedAt: Number(candidate?.valueUpdatedAt || fallbackUpdatedAt || 0),
      detailUpdatedAt: Number(candidate?.detailUpdatedAt || fallbackUpdatedAt || 0),
      colorUpdatedAt: Number(candidate?.colorUpdatedAt || fallbackUpdatedAt || 0),
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
  const merged = {
    id: String(localMetric?.id || remoteMetric?.id || crypto.randomUUID()),
  };
  KPI_METRIC_FIELDS.forEach((field) => {
    const timestampField = `${field}UpdatedAt`;
    const localUpdatedAt = Number(localMetric?.[timestampField] || 0);
    const remoteUpdatedAt = Number(remoteMetric?.[timestampField] || 0);
    const rawValue = remoteUpdatedAt > localUpdatedAt ? remoteMetric?.[field] : localMetric?.[field];
    merged[field] = field === "color"
      ? (KPI_COLOR_VALUES.has(String(rawValue || "default").toLowerCase()) ? String(rawValue || "default").toLowerCase() : "default")
      : String(rawValue || "");
    merged[timestampField] = Math.max(localUpdatedAt, remoteUpdatedAt);
  });
  return merged;
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
    ...metrics.flatMap((metric) => KPI_METRIC_FIELDS.map((field) => metric[`${field}UpdatedAt`]))
  );
  return { updatedAt, metrics };
}

async function fetchRemoteMetricsPayload(gameId, useWizardsDefaults = false) {
  if (!supabase || !gameId) return null;
  const { data, error } = await supabase
    .from(KPI_SHARED_TABLE)
    .select("payload,updated_at")
    .eq("scope_type", KPI_SCOPE_TYPE)
    .eq("scope_key", String(gameId))
    .maybeSingle();
  if (error) throw error;
  if (!data?.payload) {
    if (!useWizardsDefaults) return null;
    const { data: template, error: templateError } = await supabase.from(KPI_SHARED_TABLE)
      .select("payload").eq("scope_type", KPI_SCOPE_TYPE).eq("scope_key", KPI_TEMPLATE_KEY).maybeSingle();
    if (templateError) throw templateError;
    return template?.payload ? metricsTemplate(template.payload) : null;
  }
  return normalizeMetricsPayload({
    updatedAt: data?.updated_at ? new Date(data.updated_at).getTime() : Number(data?.payload?.updatedAt || 0),
    metrics: data?.payload?.metrics,
  });
}

function metricsTemplate(raw) {
  const payload = normalizeMetricsPayload(raw);
  return { ...payload, metrics: payload.metrics.map((metric) => ({ ...metric, value: "", valueUpdatedAt: 0 })) };
}

async function saveSharedPayloadWithRetry({ scopeType, scopeKey, buildPayload, maxAttempts = 4 }) {
  if (!supabase) return null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data: currentRow, error: readError } = await supabase
      .from(KPI_SHARED_TABLE)
      .select("payload,updated_at")
      .eq("scope_type", scopeType)
      .eq("scope_key", scopeKey)
      .maybeSingle();

    if (readError) throw readError;

    const currentPayload = currentRow?.payload
      ? normalizeMetricsPayload({
        updatedAt: currentRow?.updated_at ? new Date(currentRow.updated_at).getTime() : Number(currentRow?.payload?.updatedAt || 0),
        metrics: currentRow?.payload?.metrics,
      })
      : null;

    const nextPayload = buildPayload(currentPayload);
    if (currentPayload && JSON.stringify(currentPayload.metrics) === JSON.stringify(nextPayload.metrics)) return currentPayload;

    if (currentRow?.updated_at) {
      const { data: updatedRow, error: updateError } = await supabase
        .from(KPI_SHARED_TABLE)
        .update({ payload: nextPayload })
        .eq("scope_type", scopeType)
        .eq("scope_key", scopeKey)
        .eq("updated_at", currentRow.updated_at)
        .select("payload,updated_at")
        .maybeSingle();

      if (updateError) throw updateError;
      if (updatedRow?.payload) {
        return normalizeMetricsPayload({
          updatedAt: updatedRow.updated_at ? new Date(updatedRow.updated_at).getTime() : Number(updatedRow?.payload?.updatedAt || 0),
          metrics: updatedRow.payload.metrics,
        });
      }
      continue;
    }

    const { data: insertedRow, error: insertError } = await supabase
      .from(KPI_SHARED_TABLE)
      .insert({
        scope_type: scopeType,
        scope_key: scopeKey,
        payload: nextPayload,
      })
      .select("payload,updated_at")
      .maybeSingle();

    if (!insertError && insertedRow?.payload) {
      return normalizeMetricsPayload({
        updatedAt: insertedRow.updated_at ? new Date(insertedRow.updated_at).getTime() : Number(insertedRow?.payload?.updatedAt || 0),
        metrics: insertedRow.payload.metrics,
      });
    }

    if (insertError?.code !== "23505") {
      throw insertError;
    }
  }

  throw new Error("Unable to save KPI changes after multiple retries.");
}

async function saveRemoteMetricsPayload(gameId, payload, saveWizardsDefaults = false) {
  if (!supabase || !gameId) return payload;
  const saved = await saveSharedPayloadWithRetry({
    scopeType: KPI_SCOPE_TYPE,
    scopeKey: String(gameId),
    buildPayload: (remotePayload) => mergeMetricsPayload(payload, remotePayload),
  });
  if (saveWizardsDefaults) {
    await saveSharedPayloadWithRetry({
      scopeType: KPI_SCOPE_TYPE,
      scopeKey: KPI_TEMPLATE_KEY,
      buildPayload: (remotePayload) => metricsTemplate(mergeMetricsPayload(metricsTemplate(payload), remotePayload)),
    });
  }
  return saved;
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
  const activeFieldRef = useRef("");
  const remoteSaveFailuresRef = useRef(0);
  const remoteSaveBlockedUntilRef = useRef(0);

  const { data: game, isLoading, error } = useGame(gameId);

  const supportedTeamGame = useMemo(() => {
    const homeTeam = game?.homeTeam;
    const awayTeam = game?.awayTeam;
    return isWashingtonTeam(homeTeam) || isWashingtonTeam(awayTeam) || isCapitalCityTeam(homeTeam) || isCapitalCityTeam(awayTeam);
  }, [game]);
  const remoteSyncEnabled = supportedTeamGame && Boolean(gameId);
  const isWizardsGame = isWashingtonTeam(game?.homeTeam) || isWashingtonTeam(game?.awayTeam);

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
    if (!gameId || !remoteSyncEnabled) return undefined;
    let cancelled = false;

    const applyIncomingPayload = (incomingPayload) => {
      if (!incomingPayload) return;
      setMetricsPayload((current) => {
        const baseMerged = mergeMetricsPayload(current, incomingPayload);
        const activeField = activeFieldRef.current;
        const merged = activeField
          ? {
            ...baseMerged,
            metrics: baseMerged.metrics.map((metric, index) => {
              const currentMetric = current.metrics[index] || DEFAULT_METRICS[index];
              const field = KPI_METRIC_FIELDS.find((candidate) => activeField === `${metric.id}:${candidate}`);
              if (field) {
                return {
                  ...metric,
                  [field]: currentMetric[field],
                  [`${field}UpdatedAt`]: currentMetric[`${field}UpdatedAt`],
                };
              }
              return metric;
            }),
          }
          : baseMerged;
        const mergedKey = payloadStateKey(merged);
        if (mergedKey === metricsStateKeyRef.current) return current;
        skipNextSaveRef.current = true;
        metricsStateKeyRef.current = mergedKey;
        persistMetricsPayload(gameId, merged);
        return merged;
      });
    };

    const loadRemoteMetrics = () => {
      fetchRemoteMetricsPayload(gameId, isWizardsGame)
        .then((payload) => {
          if (cancelled || !payload) return;
          applyIncomingPayload(payload);
        })
        .catch(() => {});
    };

    if (!supabase) {
      return () => {
        cancelled = true;
      };
    }

    loadRemoteMetrics();
    const intervalId = window.setInterval(loadRemoteMetrics, KPI_REMOTE_POLL_INTERVAL_MS);
    window.addEventListener("focus", loadRemoteMetrics);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", loadRemoteMetrics);
    };
  }, [gameId, remoteSyncEnabled, isWizardsGame]);

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
    if (!KPI_METRIC_FIELDS.includes(field)) return;
    const timestamp = Date.now();
    setMetricsPayload((current) => ({
      updatedAt: timestamp,
      metrics: current.metrics.map((metric) => {
        if (metric.id !== metricId) return metric;
        return { ...metric, [field]: value, [`${field}UpdatedAt`]: timestamp };
      }),
    }));
  };

  useEffect(() => {
    if (!gameId || !hydratedRef.current || !remoteSyncEnabled) return undefined;

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const now = Date.now();
      if (remoteSaveBlockedUntilRef.current > now) {
        const seconds = Math.max(1, Math.ceil((remoteSaveBlockedUntilRef.current - now) / 1000));
        setSyncError(`Supabase sync is cooling down after repeated failures. Retrying is paused for ${seconds}s.`);
        return;
      }

      saveRemoteMetricsPayload(gameId, metricsPayload, isWizardsGame)
        .then((savedPayload) => {
          remoteSaveFailuresRef.current = 0;
          remoteSaveBlockedUntilRef.current = 0;
          setSyncError("");
          setMetricsPayload((current) => {
            const baseMerged = mergeMetricsPayload(current, savedPayload);
            const activeField = activeFieldRef.current;
            const merged = activeField
              ? {
                ...baseMerged,
                metrics: baseMerged.metrics.map((metric, index) => {
                  const currentMetric = current.metrics[index] || DEFAULT_METRICS[index];
                  const field = KPI_METRIC_FIELDS.find((candidate) => activeField === `${metric.id}:${candidate}`);
                  if (field) {
                    return {
                      ...metric,
                      [field]: currentMetric[field],
                      [`${field}UpdatedAt`]: currentMetric[`${field}UpdatedAt`],
                    };
                  }
                  return metric;
                }),
              }
              : baseMerged;
            const mergedKey = payloadStateKey(merged);
            if (mergedKey === metricsStateKeyRef.current) {
              return current;
            }
            skipNextSaveRef.current = true;
            metricsStateKeyRef.current = mergedKey;
            persistMetricsPayload(gameId, merged);
            return merged;
          });
        })
        .catch((saveError) => {
          console.error("Failed to save KPI state.", saveError);
          remoteSaveFailuresRef.current += 1;
          if (remoteSaveFailuresRef.current >= KPI_REMOTE_SAVE_FAILURE_LIMIT) {
            const cooldownMs = Math.min(
              KPI_REMOTE_SAVE_MAX_COOLDOWN_MS,
              KPI_REMOTE_SAVE_MIN_COOLDOWN_MS * (2 ** (remoteSaveFailuresRef.current - KPI_REMOTE_SAVE_FAILURE_LIMIT))
            );
            remoteSaveBlockedUntilRef.current = Date.now() + cooldownMs;
          }
          setSyncError(saveError?.message || "Unable to sync KPI changes.");
        });
    }, KPI_REMOTE_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [gameId, metricsPayload, remoteSyncEnabled, isWizardsGame]);

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
                    onFocus={() => {
                      activeFieldRef.current = `${metric.id}:name`;
                    }}
                    onBlur={() => {
                      if (activeFieldRef.current === `${metric.id}:name`) {
                        activeFieldRef.current = "";
                      }
                    }}
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
                    onFocus={() => {
                      activeFieldRef.current = `${metric.id}:value`;
                    }}
                    onBlur={() => {
                      if (activeFieldRef.current === `${metric.id}:value`) {
                        activeFieldRef.current = "";
                      }
                    }}
                    placeholder="0"
                    inputMode="numeric"
                  />
                </label>
                <label className={styles.fieldLabel}>
                  Text below box
                  <textarea
                    className={`${styles.textInput} ${styles.detailInput}`}
                    value={metric.detail}
                    onChange={(event) => updateMetric(metric.id, "detail", event.target.value)}
                    onFocus={() => {
                      activeFieldRef.current = `${metric.id}:detail`;
                    }}
                    onBlur={() => {
                      if (activeFieldRef.current === `${metric.id}:detail`) {
                        activeFieldRef.current = "";
                      }
                    }}
                    placeholder="Optional supporting text"
                    maxLength={120}
                    rows={2}
                  />
                </label>
                <fieldset className={styles.colorFieldset}>
                  <legend>Box color</legend>
                  <div className={styles.colorOptions}>
                    {KPI_COLOR_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`${styles.colorOption} ${styles[`colorOption_${option.value}`] || ""} ${metric.color === option.value ? styles.colorOptionSelected : ""}`}
                        aria-pressed={metric.color === option.value}
                        onClick={() => updateMetric(metric.id, "color", option.value)}
                      >
                        <span className={styles.colorSwatch} aria-hidden="true" />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </section>
            ))}
          </div>
          {isWashingtonTeam(game?.homeTeam) || isWashingtonTeam(game?.awayTeam) ? <KpiTablesEditor key={gameId} gameId={gameId} /> : null}
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
                      <div className={`${styles.displayMetricValueBox} ${styles[`displayMetricValueBox_${metric.color}`] || ""}`}>
                        <div className={styles.displayMetricValue}>{metric.value || " "}</div>
                      </div>
                      <div className={styles.displayMetricDetail}>{metric.detail || " "}</div>
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
