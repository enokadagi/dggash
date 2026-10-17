"use client";

import { useAuthStore, type User, type Tokens } from "@/stores/auth-store";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { api } from "@/lib/api";

export function useAuth() {
  const { user, isAuthenticated, login, logout, setUser, setTokens } = useAuthStore();
  const router = useRouter();

  const signIn = useCallback(
    async (phone: string, password: string) => {
      const response = await api.post<{ user: User; accessToken: string; refreshToken: string }>(
        "/auth/login",
        { identifier: phone, password }
      );
      const { user: userData, accessToken, refreshToken } = response;
      login(userData, { accessToken, refreshToken });
      return userData;
    },
    [login]
  );

  const signOut = useCallback(() => {
    logout();
    router.push("/login");
  }, [logout, router]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await api.post("/auth/change-password", { currentPassword, newPassword });
    },
    []
  );

  return {
    user,
    isAuthenticated,
    signIn,
    signOut,
    changePassword,
    setUser,
    setTokens,
  };
}
