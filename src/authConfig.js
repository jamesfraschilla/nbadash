export const ACCOUNTS_ENABLED = import.meta.env.VITE_ENABLE_ACCOUNTS !== "false";
export const ALLOWED_EMAIL_DOMAIN = (import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || "monumentalsports.com")
  .replace(/^@/, "")
  .toLowerCase();

export const ACCOUNT_ROLES = ["admin", "coach"];
export const ACCOUNT_TEAM_SCOPES = [
  { value: "washington", label: "Washington" },
  { value: "capital_city", label: "Capital City" },
  { value: "washington_summer", label: "Summer League" },
];
export const ACCOUNT_FEATURE_FLAGS = [
  { key: "match_ups", label: "Match-Ups" },
  { key: "tools", label: "Tools" },
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
