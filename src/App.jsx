import { useEffect, useRef, useState } from "react";
import { Route, Routes } from "react-router-dom";
import Header from "./components/Header.jsx";
import AccessGate from "./components/AccessGate.jsx";
import AuthGate from "./components/AuthGate.jsx";
import LegacyNotesImportPrompt from "./components/LegacyNotesImportPrompt.jsx";
import PasswordResetGate from "./components/PasswordResetGate.jsx";
import { useAuth } from "./auth/useAuth.js";
import Home from "./pages/Home.jsx";
import Game from "./pages/Game.jsx";
import PlayByPlay from "./pages/PlayByPlay.jsx";
import Minutes from "./pages/Minutes.jsx";
import Notes from "./pages/Notes.jsx";
import Drawing from "./pages/Drawing.jsx";
import PreGame from "./pages/PreGame.jsx";
import Rotations from "./pages/Rotations.jsx";
import Admin from "./pages/Admin.jsx";
import UserContent from "./pages/UserContent.jsx";

const ACCESS_SESSION_STORAGE_KEY = "site-access-session:v1";
const ACCESS_SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
const SITE_ACCESS_CODE = import.meta.env.VITE_SITE_ACCESS_CODE || "Dominate";
const UPDATE_CHECK_INTERVAL_MS = 2 * 60 * 1000;

function getCurrentBundleFingerprint() {
  if (typeof document === "undefined" || typeof window === "undefined") return "";
  const script = document.querySelector('script[type="module"][src]');
  const src = script?.getAttribute("src");
  if (!src) return "";
  return new URL(src, window.location.origin).href;
}

function getBundleFingerprintFromHtml(html) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return "";
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const script = parsed.querySelector('script[type="module"][src]');
  const src = script?.getAttribute("src");
  if (!src) return "";
  return new URL(src, window.location.origin).href;
}

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
  const [updateFingerprint, setUpdateFingerprint] = useState("");
  const currentFingerprintRef = useRef("");
  const dismissedFingerprintRef = useRef("");
  const {
    accountsEnabled,
    loading,
    user,
    profile,
    requiresPasswordReset,
    signOut,
    isAdmin,
  } = useAuth();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!import.meta.env.PROD || typeof window === "undefined") return undefined;

    currentFingerprintRef.current = getCurrentBundleFingerprint();

    const checkForUpdate = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const url = new URL(`${import.meta.env.BASE_URL}index.html`, window.location.origin);
        url.searchParams.set("t", String(Date.now()));
        const response = await fetch(url.toString(), { cache: "no-store" });
        if (!response.ok) return;
        const html = await response.text();
        const nextFingerprint = getBundleFingerprintFromHtml(html);
        if (
          nextFingerprint
          && currentFingerprintRef.current
          && nextFingerprint !== currentFingerprintRef.current
          && nextFingerprint !== dismissedFingerprintRef.current
        ) {
          setUpdateFingerprint(nextFingerprint);
        }
      } catch {
        // Ignore transient fetch failures.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForUpdate();
      }
    };

    const intervalId = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    checkForUpdate();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", checkForUpdate);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

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

  if (accountsEnabled) {
    if (loading) {
      return <div style={{ padding: "40px 16px", textAlign: "center" }}>Loading account...</div>;
    }

    if (!user) {
      return <AuthGate />;
    }

    if (requiresPasswordReset) {
      return <PasswordResetGate />;
    }

    if (!profile) {
      return (
        <div style={{ padding: "40px 16px", textAlign: "center" }}>
          Your account is signed in, but no profile was found yet.
        </div>
      );
    }

    if (profile.status !== "active") {
      return (
        <div style={{ padding: "40px 16px", textAlign: "center" }}>
          <div>Your account is currently {profile.status}.</div>
          <button type="button" onClick={signOut} style={{ marginTop: 12 }}>
            Sign Out
          </button>
        </div>
      );
    }
  } else if (!isUnlocked) {
    return <AccessGate onUnlock={unlockSite} />;
  }

  return (
    <div>
      {accountsEnabled ? <LegacyNotesImportPrompt /> : null}
      {updateFingerprint ? (
        <div style={{
          position: "fixed",
          inset: "16px 16px auto 16px",
          zIndex: 1600,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
        }}
        >
          <div style={{
            width: "min(520px, 100%)",
            padding: "14px 16px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--panel)",
            color: "var(--text)",
            boxShadow: "0 18px 38px rgba(0, 0, 0, 0.18)",
            pointerEvents: "auto",
          }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Newer Version Available</div>
            <div style={{ color: "var(--muted)", marginBottom: 12 }}>
              Refresh your browser to load the latest updates and fixes.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  dismissedFingerprintRef.current = updateFingerprint;
                  setUpdateFingerprint("");
                }}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  background: "var(--bg)",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                Later
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  border: "1px solid var(--highlight-text)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  background: "var(--highlight-text)",
                  color: "var(--bg)",
                  cursor: "pointer",
                }}
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <Header
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onSignOut={accountsEnabled ? signOut : lockSite}
        profile={profile}
        isAdmin={isAdmin}
      />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/me" element={<UserContent />} />
          <Route path="/admin" element={<Admin />} />
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
