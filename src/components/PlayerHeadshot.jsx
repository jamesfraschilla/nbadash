import { useEffect, useMemo, useState } from "react";
import { playerHeadshotUrls } from "../api.js";
import { PLAYER_HEADSHOT_CHANGE_EVENT } from "../playerHeadshotOverrides.js";

export default function PlayerHeadshot({
  personId,
  teamId = null,
  overrideKeys = [],
  className,
  style,
  alt = "",
  draggable = false,
  fallback = null,
  onLoad,
}) {
  const [headshotVersion, setHeadshotVersion] = useState(0);
  const overrideKeySignature = Array.isArray(overrideKeys) ? overrideKeys.join("|") : "";
  const normalizedOverrideKeys = useMemo(
    () => (overrideKeySignature ? overrideKeySignature.split("|").filter(Boolean) : []),
    [overrideKeySignature]
  );
  const sources = useMemo(
    () => playerHeadshotUrls(personId, teamId, { overrideKeys: normalizedOverrideKeys }),
    [personId, teamId, normalizedOverrideKeys, headshotVersion]
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const refresh = () => setHeadshotVersion((value) => value + 1);
    window.addEventListener(PLAYER_HEADSHOT_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(PLAYER_HEADSHOT_CHANGE_EVENT, refresh);
  }, []);

  useEffect(() => {
    setSourceIndex(0);
    setExhausted(false);
  }, [sources]);

  const source = sources[sourceIndex] || null;

  if (!source || exhausted) {
    return fallback;
  }

  return (
    <img
      className={className}
      src={source}
      style={style}
      alt={alt}
      draggable={draggable}
      onLoad={onLoad}
      onError={() => {
        if (sourceIndex < sources.length - 1) {
          setSourceIndex((current) => current + 1);
          return;
        }
        setExhausted(true);
      }}
    />
  );
}
