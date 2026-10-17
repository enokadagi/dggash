import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { clearStoredTokens, setStoredTokens } from "@/lib/auth-storage";

const AUTH_COOKIE_NAME = "awiknet_session";

function safeSetCookie(name: string, value: string, maxAgeDays = 7) {
  if (typeof document === "undefined") return;
  const maxAgeSeconds = maxAgeDays * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax; Secure=false`;
}

function safeRemoveCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax; Secure=false`;
}

export interface User {
  id: string;
  phone: string;
  email?: string;
  firstName: string;
  lastName: string;
  role: string;
  status?: string;
  avatar?: string;
  mustChangePassword?: boolean;
  twoFactorEnabled?: boolean;
  lastLoginAt?: string;
  createdAt?: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  user: User | null;
  tokens: Tokens | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  setUser: (user: User) => void;
  setTokens: (tokens: Tokens) => void;
  login: (user: User, tokens: Tokens) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      hasHydrated: false,

      setUser: (user) => set({ user }),

      setTokens: (tokens) => {
        setStoredTokens(tokens);
        safeSetCookie(AUTH_COOKIE_NAME, "authenticated");
        set({ tokens });
      },

      login: (user, tokens) => {
        setStoredTokens(tokens);
        safeSetCookie(AUTH_COOKIE_NAME, "authenticated");
        set({ user, tokens, isAuthenticated: true });
      },

      logout: () => {
        clearStoredTokens();
        safeRemoveCookie(AUTH_COOKIE_NAME);
        set({ user: null, tokens: null, isAuthenticated: false });
      },

      updateUser: (updates) => {
        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, ...updates } });
        }
      },
    }),
    {
      name: "AWIK NET-auth",
      storage: createJSONStorage(() => {
        const fallbackStorage = (() => {
          const values = new Map<string, string>();
          return {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => {
              values.set(key, value);
            },
            removeItem: (key: string) => {
              values.delete(key);
            },
            clear: () => {
              values.clear();
            },
          } as Storage;
        })();

        if (typeof window === "undefined") {
          return fallbackStorage;
        }

        return (window.sessionStorage ?? fallbackStorage) as Storage;
      }),
      onRehydrateStorage: () => () => {
        useAuthStore.setState({ hasHydrated: true });
      },
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
