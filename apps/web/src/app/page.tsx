"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, readStoredIsAuthenticated } from "@/stores/auth-store";

export default function HomePage() {
  const router = useRouter();
  const storeAuth = useAuthStore((state) => state.isAuthenticated);
  const [ready, setReady] = useState(false);
  const [storedAuth, setStoredAuth] = useState(false);

  useEffect(() => {
    setStoredAuth(readStoredIsAuthenticated());
    setReady(true);
  }, []);

  // Combine the (async-rehydrating) store value with a synchronous storage read
  // so a hard load doesn't route a logged-in user to /login before hydration.
  const isAuthenticated = storeAuth || storedAuth;

  useEffect(() => {
    if (!ready) return;
    if (isAuthenticated) {
      router.replace("/sales/pos");
    } else {
      router.replace("/login");
    }
  }, [ready, isAuthenticated, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent text-primary" />
    </div>
  );
}
