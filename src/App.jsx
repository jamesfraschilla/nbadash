import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import Header from "./components/Header.jsx";
import Home from "./pages/Home.jsx";
import Game from "./pages/Game.jsx";
import PlayByPlay from "./pages/PlayByPlay.jsx";
import Minutes from "./pages/Minutes.jsx";

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <div>
      <Header theme={theme} onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")} />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/g/:gameId" element={<Game />} />
          <Route path="/g/:gameId/events" element={<PlayByPlay />} />
          <Route path="/m/:gameId" element={<Minutes />} />
        </Routes>
      </main>
    </div>
  );
}
