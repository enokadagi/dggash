"use client";

import * as React from "react";
import { Printer, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { usePrinter, printerService } from "@/hooks/use-printer";
import { buildSaleReceipt, type PaperWidth } from "@/lib/receipt";
import { buildReceiptHtml, printHtmlDocument } from "@/lib/receipt-html";
import { usePrintSettings } from "@/hooks/api/use-print-settings";
import type { Sale } from "@/hooks/api/use-sales";
import { Button } from "@/components/ui/button";

import { toast } from "sonner";

const PAPER_KEY = "awiknet.printer.paper";
const AUTO_PRINT_KEY = "awiknet.printer.autoPrint";

interface Props {
  sale: Sale;
  cashierName?: string;
  /** Called after a successful print so the caller can advance its UI. */
  onPrinted?: () => void;
}

function paperWidth(): PaperWidth {
  if (typeof localStorage === "undefined") return 80;
  try {
    return localStorage.getItem(PAPER_KEY) === "58" ? 58 : 80;
  } catch {
    return 80;
  }
}

/**
 * Prints a completed sale.
 *
 * Auto-print fires once per sale id: reprinting from the success screen stays
 * manual, and a failed print never loops.
 */
export function ReceiptPrintButton({ sale, cashierName, onPrinted }: Props) {
  const printer = usePrinter();
  const [busy, setBusy] = React.useState(false);
  const printedRef = React.useRef<Set<string>>(new Set());

  const { data: settings } = useQuery({
    queryKey: ["company-settings", "receipt"],
    queryFn: async () => {
      const raw = await api.get<{ key: string; value: string }[]>("/settings");
      const map: Record<string, string> = {};
      for (const entry of raw ?? []) map[entry.key] = entry.value;
      return map;
    },
    staleTime: 60_000,
  });

  const printSettings = usePrintSettings();

  const autoPrintEnabled = React.useMemo(() => {
    if (printSettings.data?.thermal.autoPrint) return true;
    if (typeof localStorage === "undefined") return false;
    try {
      return localStorage.getItem(AUTO_PRINT_KEY) !== "false";
    } catch {
      return false;
    }
  }, [printSettings.data?.thermal.autoPrint]);

  const job = React.useMemo(
    () =>
      buildSaleReceipt(sale, {
        paperWidth: paperWidth(),
        company: {
          name: settings?.["company.name"] ?? "AWIK NET",
          tagline: settings?.["company.tagline"] ?? "",
          phone: settings?.["company.phone"] ?? "",
          address: settings?.["company.address"] ?? "",
        },
        cashierName,
      }),
    [sale, settings, cashierName],
  );

  const doPrint = React.useCallback(async () => {
    setBusy(true);
    try {
      const ok = await printerService.print(job);
      if (ok) {
        printedRef.current.add(sale.id);
        toast.success("Receipt sent to thermal printer");
        onPrinted?.();
      } else {
        toast.error("Could not print receipt. Ensure USB printer is connected and not locked by Windows.");
      }
    } catch (err: any) {
      toast.error(err.message || "Thermal print failed");
    } finally {
      setBusy(false);
    }
  }, [job, sale.id, onPrinted]);

  React.useEffect(() => {
    if (!autoPrintEnabled) return;
    if (printedRef.current.has(sale.id)) return;
    if (printer.status !== "ready") return;
    // One retry when the printer finishes connecting after the sale completes.
    void doPrint();
  }, [autoPrintEnabled, printer.status, sale.id, doPrint]);

  return (
    <Button type="button" variant="outline" onClick={doPrint} disabled={busy}>
      {busy ? (
        <Loader2 className="me-2 h-4 w-4 animate-spin" />
      ) : (
        <Printer className="me-2 h-4 w-4" />
      )}
      Print receipt
    </Button>
  );
}
