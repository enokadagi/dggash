"use client";

import * as React from "react";
import { Loader2, ScanLine, ScanBarcode } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WedgeScannerStatus } from "@/hooks/use-wedge-scanner";

interface ScannerStatusProps {
  status: WedgeScannerStatus;
  /** Echoes the last accepted payload so the operator can trust the read. */
  lastScanned?: string | null;
  className?: string;
}

/**
 * Compact scanner state indicator for the POS header.
 *
 * Shows "Ready to scan" whenever the keyboard-wedge listener is armed, which is
 * the state the cashier needs to see to know the HENEX device is live.
 */
export function ScannerStatus({ status, lastScanned, className }: ScannerStatusProps) {
  const label =
    status === "capturing" ? "Reading…" : status === "listening" ? "Ready to scan" : "Scanner off";

  const Icon = status === "capturing" ? Loader2 : status === "listening" ? ScanBarcode : ScanLine;

  return (
    <div
      className={cn("flex items-center gap-2 text-xs", className)}
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
          status === "listening" && "border-success/40 bg-success/10 text-success",
          status === "capturing" && "border-primary/40 bg-primary/10 text-primary",
          status === "idle" && "border-muted-foreground/30 bg-muted text-muted-foreground"
        )}
      >
        <Icon className={cn("h-3.5 w-3.5", status === "capturing" && "animate-spin")} />
        {label}
      </span>
      {lastScanned && (
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          last: {lastScanned}
        </span>
      )}
    </div>
  );
}
