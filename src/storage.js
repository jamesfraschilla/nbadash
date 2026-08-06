export function readLocalStorage(key) {
  if (typeof window === "undefined" || !key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalStorage(key, value) {
  if (typeof window === "undefined" || !key) return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function isQuotaError(error) {
  return error?.name === "QuotaExceededError"
    || error?.name === "NS_ERROR_DOM_QUOTA_REACHED"
    || error?.code === 22
    || error?.code === 1014;
}

export function evictLocalStoragePrefixes(prefixes) {
  if (typeof window === "undefined" || !window.localStorage || !Array.isArray(prefixes) || !prefixes.length) {
    return;
  }
  try {
    const storageKeys = new Set(Object.keys(window.localStorage));
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key) storageKeys.add(key);
    }
    [...storageKeys]
      .filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore restrictive browser storage failures.
  }
}

export function writeLocalStorageWithEviction(key, value, evictionPrefixes) {
  if (typeof window === "undefined" || !key) return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaError(error)) return false;
    evictLocalStoragePrefixes(evictionPrefixes);
    return writeLocalStorage(key, value);
  }
}
