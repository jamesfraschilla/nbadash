import { useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function GameFeedStatus() {
  const cache = useQueryClient().getQueryCache();
  const status = useSyncExternalStore(
    notify => cache.subscribe(notify),
    () => cache.findAll({ type: "active" }).filter(q => q.queryKey[0] === "game")
      .map(q => q.state.data?._snapshotSavedAt ? `Saved game data from ${new Date(q.state.data._snapshotSavedAt).toLocaleString()}. Not live; reconnecting automatically.`
        : q.state.data?.feedAvailability?.limited ? "Backup NBA feed in use. Some advanced statistics are unavailable." : "").filter(Boolean).join(" "),
    () => "",
  );
  return status ? <div role="status" style={{ padding: "12px 16px", background: "#654900", color: "white" }}>{status}</div> : null;
}
