"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useAuthStore, readStoredIsAuthenticated } from "@/stores/auth-store";
import { useLocalization } from "@/hooks/use-localization";
import { Loader2 } from "lucide-react";

/** Routes a non-admin (STAFF) user is allowed to reach. */
function isStaffAllowed(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return (
    path === "/sales/pos" ||
    path.startsWith("/customers") ||
    path === "/settings/profile"
  );
}

export default function DashboardLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const storeAuth = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.user?.role);
  const { t } = useLocalization();
  const [ready, setReady] = React.useState(false);
  const [storedAuth, setStoredAuth] = React.useState(false);

  React.useEffect(() => {
    setReady(true);
    setStoredAuth(readStoredIsAuthenticated());
  }, []);

  // The persisted store rehydrates asynchronously, so a hard page load can
  // briefly report `isAuthenticated === false` for a logged-in user. Combining
  // the store value with a synchronous storage read avoids bouncing users back
  // to /login (or stranding them on a spinner) before rehydration finishes.
  const isAuthenticated = storeAuth || storedAuth;

  React.useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace("/login");
    }
  }, [ready, isAuthenticated, router]);

  React.useEffect(() => {
    if (ready && isAuthenticated && role && role !== "ADMIN" && !isStaffAllowed(pathname)) {
      router.replace("/sales/pos");
    }
  }, [ready, isAuthenticated, role, pathname, router]);

  if (!ready || !isAuthenticated) {
    // Render the shell instead of `null` so the user never sees a blank page
    // while the auth store rehydrates on first load.
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
