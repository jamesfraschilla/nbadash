import { useEffect, useRef, useState } from "react";
import {
  renderMatchupGraphicCanvas,
} from "../pages/matchupGraphicExport.js";

const DEFAULT_PREVIEW_WIDTH = 960;
const DEFAULT_PREVIEW_HEIGHT = 540;
const DEFAULT_PREVIEW_DEBOUNCE_MS = 400;
const MAX_CONCURRENT_PREVIEW_RENDERS = 1;
let activePreviewRenders = 0;
const previewRenderQueue = [];

function drainPreviewRenderQueue() {
  while (activePreviewRenders < MAX_CONCURRENT_PREVIEW_RENDERS && previewRenderQueue.length) {
    const next = previewRenderQueue.shift();
    next();
  }
}

function enqueuePreviewRender(task) {
  let cancelled = false;
  const run = () => {
    if (cancelled) {
      drainPreviewRenderQueue();
      return;
    }
    activePreviewRenders += 1;
    task().finally(() => {
      activePreviewRenders = Math.max(0, activePreviewRenders - 1);
      drainPreviewRenderQueue();
    });
  };

  previewRenderQueue.push(run);
  drainPreviewRenderQueue();

  return () => {
    cancelled = true;
    const index = previewRenderQueue.indexOf(run);
    if (index >= 0) previewRenderQueue.splice(index, 1);
  };
}

export default function MatchupGraphicPreview({
  className,
  canvasClassName,
  statusClassName,
  league = "nba",
  leftPlayers,
  rightPlayers,
  logoTeamId,
  isReady,
  unavailableMessage = "Preview appears after both teams, ten players, and a logo are selected.",
  lazy = false,
  previewWidth = DEFAULT_PREVIEW_WIDTH,
  previewHeight = DEFAULT_PREVIEW_HEIGHT,
  debounceMs = DEFAULT_PREVIEW_DEBOUNCE_MS,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [isVisible, setIsVisible] = useState(!lazy);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!lazy || isVisible) return undefined;
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "240px" });

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible, lazy]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return undefined;

    if (!isReady) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      setStatus(unavailableMessage);
      return undefined;
    }

    if (!isVisible) {
      setStatus("");
      return undefined;
    }

    let cancelled = false;
    let cancelQueuedRender = () => {};
    const delay = Math.max(0, Number(debounceMs) || 0);
    const timerId = window.setTimeout(() => {
      if (cancelled) return;
      setStatus("Rendering preview...");
      cancelQueuedRender = enqueuePreviewRender(() => renderMatchupGraphicCanvas({
        league,
        leftPlayers,
        rightPlayers,
        logoTeamId,
        width: canvas.width,
        height: canvas.height,
      }).then((previewCanvas) => {
        if (cancelled) {
          previewCanvas.width = 1;
          previewCanvas.height = 1;
          return;
        }
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(previewCanvas, 0, 0, canvas.width, canvas.height);
        previewCanvas.width = 1;
        previewCanvas.height = 1;
        setStatus("");
      }).catch((error) => {
        console.error("Failed to render match-up preview.", error);
        if (!cancelled) setStatus("Preview unavailable.");
      }));
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      cancelQueuedRender();
    };
  }, [debounceMs, isReady, isVisible, league, leftPlayers, logoTeamId, previewHeight, previewWidth, rightPlayers, unavailableMessage]);

  return (
    <div className={className} ref={containerRef}>
      <canvas
        ref={canvasRef}
        className={canvasClassName}
        width={previewWidth}
        height={previewHeight}
        aria-label="Match-up graphic preview"
      />
      {status ? <div className={statusClassName}>{status}</div> : null}
    </div>
  );
}
