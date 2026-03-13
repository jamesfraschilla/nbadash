import { useState } from "react";
import { ALLOWED_EMAIL_DOMAIN } from "../authConfig.js";
import { useAuth } from "../auth/useAuth.js";
import styles from "./AuthGate.module.css";

export default function AuthGate() {
  const { error, emailSentTo, sendMagicLink, sendPasswordReset, signInWithPassword, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("password");
  const [submitting, setSubmitting] = useState(false);
  const [localMessage, setLocalMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setLocalMessage("");
    clearError();
    try {
      if (mode === "password") {
        await signInWithPassword(email, password);
      } else if (mode === "reset") {
        await sendPasswordReset(email);
        setLocalMessage("Password reset email sent.");
      } else {
        await sendMagicLink(email);
        setLocalMessage("Magic link sent.");
      }
    } catch (submitError) {
      setLocalMessage(submitError?.message || "Unable to continue.");
    } finally {
      setSubmitting(false);
    }
  };

  const message = error || localMessage;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.kicker}>NBA Dashboard</div>
        <h1 className={styles.title}>Sign in to your account</h1>
        <p className={styles.subtitle}>
          Invite-only access for <strong>@{ALLOWED_EMAIL_DOMAIN}</strong> accounts.
        </p>

        <div className={styles.modeTabs}>
          <button
            type="button"
            className={`${styles.modeTab} ${mode === "password" ? styles.modeTabActive : ""}`}
            onClick={() => setMode("password")}
          >
            Password
          </button>
          <button
            type="button"
            className={`${styles.modeTab} ${mode === "magic" ? styles.modeTabActive : ""}`}
            onClick={() => setMode("magic")}
          >
            Magic Link
          </button>
          <button
            type="button"
            className={`${styles.modeTab} ${mode === "reset" ? styles.modeTabActive : ""}`}
            onClick={() => setMode("reset")}
          >
            Reset Password
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="auth-email">Work Email</label>
          <input
            id="auth-email"
            className={styles.input}
            type="email"
            value={email}
            autoComplete="email"
            placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting}
          />

          {mode === "password" ? (
            <>
              <label className={styles.label} htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                className={styles.input}
                type="password"
                value={password}
                autoComplete="current-password"
                placeholder="Enter your password"
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
              />
            </>
          ) : null}

          {message ? <div className={styles.message}>{message}</div> : null}
          {emailSentTo ? (
            <div className={styles.sentMessage}>Last email sent to {emailSentTo}.</div>
          ) : null}

          <button
            type="submit"
            className={styles.submitButton}
            disabled={submitting || !email.trim() || (mode === "password" && !password)}
          >
            {submitting
              ? (mode === "password" ? "Signing In..." : "Sending...")
              : mode === "password"
                ? "Sign In"
                : mode === "reset"
                  ? "Send Reset Email"
                  : "Send Magic Link"}
          </button>
        </form>
      </div>
    </div>
  );
}
