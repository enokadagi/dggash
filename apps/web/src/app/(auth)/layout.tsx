"use client";

import * as React from "react";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${inter.className} flex min-h-screen items-center justify-center bg-muted/30`}>
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg mb-2">
            DG
          </div>
          <h1 className="text-2xl font-bold tracking-tight">AWIK NET</h1>
          <p className="text-sm text-muted-foreground">ISP Management Platform</p>
        </div>
        {children}
      </div>
    </div>
  );
}
