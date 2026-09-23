"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useAuthStore } from "@/stores/auth-store";

export default function DashboardLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setReady(true);
  }, []);

  React.useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace("/login");
    }
  }, [ready, isAuthenticated, router]);

  if (!ready || !isAuthenticated) {
    return null;
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
