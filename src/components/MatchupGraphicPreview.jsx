import { useEffect, useRef, useState } from "react";
import {
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  renderMatchupGraphicCanvas,
} from "../pages/matchupGraphicExport.js";

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

    context.clearRect(0, 0, canvas.width, canvas.height);

    if (!isReady) {
      setStatus(unavailableMessage);
      return undefined;
    }

    if (!isVisible) {
      setStatus("");
      return undefined;
    }

    let cancelled = false;
    setStatus("Rendering preview...");
    renderMatchupGraphicCanvas({
      league,
      leftPlayers,
      rightPlayers,
      logoTeamId,
    }).then((previewCanvas) => {
      if (cancelled) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(previewCanvas, 0, 0, canvas.width, canvas.height);
      setStatus("");
    }).catch((error) => {
      console.error("Failed to render match-up preview.", error);
      if (!cancelled) setStatus("Preview unavailable.");
    });

    return () => {
      cancelled = true;
    };
  }, [isReady, isVisible, league, leftPlayers, logoTeamId, rightPlayers, unavailableMessage]);

  return (
    <div className={className} ref={containerRef}>
      <canvas
        ref={canvasRef}
        className={canvasClassName}
        width={EXPORT_WIDTH}
        height={EXPORT_HEIGHT}
        aria-label="Match-up graphic preview"
      />
      {status ? <div className={statusClassName}>{status}</div> : null}
    </div>
  );
}
