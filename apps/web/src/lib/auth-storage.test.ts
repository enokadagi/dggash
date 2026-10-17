import test from "node:test";
import assert from "node:assert/strict";

import {
  clearStoredTokens,
  getStoredAccessToken,
  getStoredRefreshToken,
  setStoredTokens,
} from "./auth-storage.ts";

test("stores auth tokens in session storage instead of persistent local storage", () => {
  const localStorageState = new Map<string, string>();
  const sessionStorageState = new Map<string, string>();

  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => localStorageState.get(key) ?? null,
      setItem: (key: string, value: string) => localStorageState.set(key, value),
      removeItem: (key: string) => localStorageState.delete(key),
      clear: () => localStorageState.clear(),
    },
    configurable: true,
  });

  Object.defineProperty(globalThis, "sessionStorage", {
    value: {
      getItem: (key: string) => sessionStorageState.get(key) ?? null,
      setItem: (key: string, value: string) => sessionStorageState.set(key, value),
      removeItem: (key: string) => sessionStorageState.delete(key),
      clear: () => sessionStorageState.clear(),
    },
    configurable: true,
  });

  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: globalThis.localStorage,
      sessionStorage: globalThis.sessionStorage,
    },
    configurable: true,
  });

  setStoredTokens({ accessToken: "access-123", refreshToken: "refresh-456" });

  assert.equal(localStorageState.get("access_token"), undefined);
  assert.equal(localStorageState.get("refresh_token"), undefined);
  assert.equal(sessionStorageState.get("awiknet_access_token"), "access-123");
  assert.equal(sessionStorageState.get("awiknet_refresh_token"), "refresh-456");
  assert.equal(getStoredAccessToken(), "access-123");
  assert.equal(getStoredRefreshToken(), "refresh-456");

  clearStoredTokens();

  assert.equal(sessionStorageState.get("awiknet_access_token"), undefined);
  assert.equal(sessionStorageState.get("awiknet_refresh_token"), undefined);
});
