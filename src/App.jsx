import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import Header from "./components/Header.jsx";
import AccessGate from "./components/AccessGate.jsx";
import Home from "./pages/Home.jsx";
import Game from "./pages/Game.jsx";
import PlayByPlay from "./pages/PlayByPlay.jsx";
import Minutes from "./pages/Minutes.jsx";
import Notes from "./pages/Notes.jsx";
import Drawing from "./pages/Drawing.jsx";
import PreGame from "./pages/PreGame.jsx";
import Rotations from "./pages/Rotations.jsx";

const ACCESS_SESSION_STORAGE_KEY = "site-access-session:v1";
const ACCESS_SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
const SITE_ACCESS_CODE = import.meta.env.VITE_SITE_ACCESS_CODE || "Dominate";

function loadAccessSession() {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(ACCESS_SESSION_STORAGE_KEY);
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw);
    const expiresAt = Number(parsed?.expiresAt || 0);
    const accessCode = String(parsed?.accessCode || "");
    if (!expiresAt || expiresAt <= Date.now() || accessCode !== SITE_ACCESS_CODE) {
      window.localStorage.removeItem(ACCESS_SESSION_STORAGE_KEY);
      return false;
    }
    return true;
  } catch {
    window.localStorage.removeItem(ACCESS_SESSION_STORAGE_KEY);
    return false;
  }
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [isUnlocked, setIsUnlocked] = useState(loadAccessSession);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const unlockSite = (submittedCode) => {
    if (String(submittedCode) !== SITE_ACCESS_CODE) return false;
    const expiresAt = Date.now() + ACCESS_SESSION_DURATION_MS;
    window.localStorage.setItem(ACCESS_SESSION_STORAGE_KEY, JSON.stringify({
      accessCode: SITE_ACCESS_CODE,
      expiresAt,
    }));
    setIsUnlocked(true);
    return true;
  };

  const lockSite = () => {
    window.localStorage.removeItem(ACCESS_SESSION_STORAGE_KEY);
    setIsUnlocked(false);
  };

  if (!isUnlocked) {
    return <AccessGate onUnlock={unlockSite} />;
  }

  return (
    <div>
      <Header
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onLock={lockSite}
      />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/g/:gameId" element={<Game />} />
          <Route path="/g/:gameId/atc" element={<Game variant="atc" />} />
          <Route path="/g/:gameId/events" element={<PlayByPlay />} />
          <Route path="/g/:gameId/notes" element={<Notes />} />
          <Route path="/g/:gameId/pregame" element={<PreGame />} />
          <Route path="/g/:gameId/rotations" element={<Rotations />} />
          <Route path="/m/:gameId" element={<Minutes />} />
          <Route path="/draw" element={<Drawing />} />
        </Routes>
      </main>
    </div>
  );
}
