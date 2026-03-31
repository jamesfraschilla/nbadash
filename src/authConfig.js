export const ACCOUNTS_ENABLED = import.meta.env.VITE_ENABLE_ACCOUNTS !== "false";
export const ALLOWED_EMAIL_DOMAIN = (import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || "monumentalsports.com")
  .replace(/^@/, "")
  .toLowerCase();

export const ACCOUNT_ROLES = ["admin", "coach"];
export const ACCOUNT_TEAM_SCOPES = ["Washington", "Capital City"];
export const ACCOUNT_FEATURE_FLAGS = [
  { key: "match_ups", label: "Match-Ups" },
];

export function normalizeAccountEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isAllowedAccountEmail(value) {
  const normalized = normalizeAccountEmail(value);
  return normalized.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

export function buildAuthRedirectUrl() {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}${window.location.pathname}`;
}
