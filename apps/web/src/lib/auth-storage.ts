export const AUTH_ACCESS_TOKEN_KEY = "awiknet_access_token";
export const AUTH_REFRESH_TOKEN_KEY = "awiknet_refresh_token";
const LEGACY_ACCESS_TOKEN_KEY = "access_token";
const LEGACY_REFRESH_TOKEN_KEY = "refresh_token";

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    const storage = window.sessionStorage;
    const testKey = "__awiknet_storage_check__";
    storage.setItem(testKey, testKey);
    storage.removeItem(testKey);
    return storage;
  } catch {
    return null;
  }
}

function clearLegacyTokenStorage(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  } catch {
    // Ignore legacy storage cleanup failures; the app must not fail open.
  }
}

export function getStoredAccessToken(): string | null {
  const storage = getSessionStorage();
  return storage?.getItem(AUTH_ACCESS_TOKEN_KEY) ?? null;
}

export function getStoredRefreshToken(): string | null {
  const storage = getSessionStorage();
  return storage?.getItem(AUTH_REFRESH_TOKEN_KEY) ?? null;
}

export function setStoredTokens(tokens: { accessToken: string; refreshToken: string }) {
  const storage = getSessionStorage();
  if (!storage) return;

  storage.setItem(AUTH_ACCESS_TOKEN_KEY, tokens.accessToken);
  storage.setItem(AUTH_REFRESH_TOKEN_KEY, tokens.refreshToken);
  clearLegacyTokenStorage();
}

export function clearStoredTokens() {
  const storage = getSessionStorage();
  storage?.removeItem(AUTH_ACCESS_TOKEN_KEY);
  storage?.removeItem(AUTH_REFRESH_TOKEN_KEY);
  clearLegacyTokenStorage();
}
