import { useEffect, useRef, useState } from "react";
import { useGame } from "../queries.js";
import { resolveNoteClipUrl } from "../noteClipLinks.js";

// Upgrade old note links on read, never by rewriting user notes. Visible legacy
// notes share one cached game query; new NBA Clips URLs need no extra request.
export default function NoteClipLink({ note, className, isWashington, allowLookup = true }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const stored = String(note?.source_meta?.clip_url || "");
  const newLink = /^https:\/\/clips\.nba\.com\//.test(stored);
  const needsFeed = isWashington !== false && allowLookup && !newLink && /^00\d{8}$/.test(String(note.game_id));
  useEffect(() => {
    if (!needsFeed) return undefined;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return undefined; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "150px" });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [needsFeed]);
  const { data: game, isFetching } = useGame(note.game_id, {
    enabled: needsFeed && visible, staleTime: 5 * 60_000, gcTime: 5 * 60_000,
    retry: 1, refetchOnWindowFocus: false,
  });
  const url = game ? resolveNoteClipUrl(note, game) : newLink || isWashington === false ? stored : null;
  if (!needsFeed && !url && isWashington === false) return null;
  return <span ref={ref} style={{ display: "inline-flex" }}>
    {url ? <a href={url} target="_blank" rel="noreferrer" className={className}
      aria-label="Open play clip" title="Open play clip">▶</a>
      : <button type="button" disabled className={className} aria-label="Video unavailable"
        title={isFetching ? "Loading video timestamp…" : "No reliable video timestamp is available for this note."}>▶</button>}
  </span>;
}
