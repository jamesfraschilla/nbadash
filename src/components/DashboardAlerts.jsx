import { useMemo } from "react";
import { buildGameAlerts } from "../gameAlerts.js";
import GameAlerts from "./GameAlerts.jsx";
export default function DashboardAlerts({ game, basePlayers, minutesData, ...props }) {
  const alerts = useMemo(() => buildGameAlerts({ game, basePlayers, minutesData }), [game, basePlayers, minutesData]);
  return <GameAlerts {...props} alerts={alerts} />;
}
