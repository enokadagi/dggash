"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, RefreshCw, Trash2, Usb, CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { usePrinter, printerService } from "@/hooks/use-printer";
import type { CompanyDetails, PaperWidth } from "@/lib/receipt";
import type { PrinterDeviceInfo } from "@/lib/printer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";

const PAPER_KEY = "awiknet.printer.paper";
const AUTO_PRINT_KEY = "awiknet.printer.autoPrint";

function readSetting(key: string, fallback: string): string {
  if (typeof localStorage === "undefined") return fallback;
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSetting(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Non-fatal.
  }
}

export function PrinterSetup() {
  const printer = usePrinter();
  const [paperWidth, setPaperWidth] = React.useState<PaperWidth>(() => {
    const stored = readSetting(PAPER_KEY, "80");
    return stored === "58" ? 58 : 80;
  });
  const [autoPrint, setAutoPrint] = React.useState(
    () => readSetting(AUTO_PRINT_KEY, "true") === "true",
  );
  const [busy, setBusy] = React.useState<"connect" | "test" | null>(null);
  const [granted, setGranted] = React.useState<PrinterDeviceInfo[]>([]);

  const { data: settings } = useQuery({
    queryKey: ["company-settings", "printer"],
    queryFn: async () => {
      const raw = await api.get<{ key: string; value: string }[]>("/settings");
      const map: Record<string, string> = {};
      for (const entry of raw ?? []) map[entry.key] = entry.value;
      return map;
    },
    staleTime: 60_000,
  });

  const company: CompanyDetails = React.useMemo(
    () => ({
      name: settings?.["company.name"] ?? "AWIK NET",
      tagline: settings?.["company.tagline"] ?? "",
      phone: settings?.["company.phone"] ?? "",
      address: settings?.["company.address"] ?? "",
    }),
    [settings],
  );

  const refreshGranted = React.useCallback(async () => {
    setGranted(await printerService.listGranted());
  }, []);

  React.useEffect(() => {
    void refreshGranted();
  }, [refreshGranted, printer.status]);

  const onConnect = async () => {
    setBusy("connect");
    try {
      const ok = await printer.connect();
      await refreshGranted();
      if (ok) {
        toast.success("Thermal printer connected successfully");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to connect to printer");
    } finally {
      setBusy(null);
    }
  };

  const onTestPrint = async () => {
    setBusy("test");
    try {
      const ok = await printer.printTest();
      if (ok) {
        writeSetting(PAPER_KEY, String(paperWidth));
        toast.success("Test receipt sent to printer");
      } else {
        toast.error(printer.error || "Could not print test receipt. Check printer power and USB permissions.");
      }
    } catch (err: any) {
      toast.error(err.message || "Test print failed");
    } finally {
      setBusy(null);
    }
  };

  const statusBadge = (() => {
    switch (printer.status) {
      case "ready":
        return (
          <Badge className="gap-1">
            <CircleCheck className="h-3 w-3" />
            Connected
          </Badge>
        );
      case "printing":
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Printing
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="gap-1">
            <CircleAlert className="h-3 w-3" />
            Error
          </Badge>
        );
      case "unsupported":
        return <Badge variant="outline">Not supported</Badge>;
      default:
        return <Badge variant="outline">Not connected</Badge>;
    }
  })();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Printer className="h-4 w-4" />
            Receipt Printer
          </CardTitle>
          {statusBadge}
        </div>
        <CardDescription>
          USB thermal receipt printers are supported. Connect once, then the
          printer is detected automatically on this till.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!printer.supported && (
          <Alert variant="destructive">
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>USB printing is not available</AlertTitle>
            <AlertDescription className="space-y-1">
              {!printer.secureContext ? (
                <p>
                  This page is not a secure connection. USB printing requires HTTPS
                  (localhost is exempt).
                </p>
              ) : (
                <p>
                  This browser does not support WebUSB. Use Google Chrome or Microsoft
                  Edge. Receipts can still be printed from the sale screen using the
                  browser print dialog.
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {printer.error && printer.status === "error" && (
          <Alert variant="destructive">
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>Printer error</AlertTitle>
            <AlertDescription>{printer.error}</AlertDescription>
          </Alert>
        )}

        {printer.device && (
          <div className="rounded-md border p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <Usb className="h-4 w-4" />
              {printer.device.productName}
            </div>
            <p className="mt-1 text-muted-foreground">
              {printer.device.vendorName} · VID {printer.device.vendorId.toString(16)} PID{" "}
              {printer.device.productId.toString(16)}
            </p>
            {!printer.device.recognised && (
              <p className="mt-1 text-xs text-muted-foreground">
                Unrecognised manufacturer, but most ESC/POS printers work.
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="paper-width">Paper width</Label>
          <Select
            value={String(paperWidth)}
            onValueChange={(v) => {
              const width = v === "58" ? 58 : 80;
              setPaperWidth(width);
              writeSetting(PAPER_KEY, String(width));
            }}
          >
            <SelectTrigger id="paper-width" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="80">80mm (48 characters)</SelectItem>
              <SelectItem value="58">58mm (32 characters)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="auto-print"
            type="checkbox"
            checked={autoPrint}
            onChange={(e) => {
              setAutoPrint(e.target.checked);
              writeSetting(AUTO_PRINT_KEY, String(e.target.checked));
            }}
            className="h-4 w-4 rounded border-input"
          />
          <Label htmlFor="auto-print" className="cursor-pointer font-normal">
            Print a receipt automatically after each sale
          </Label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={onConnect}
            disabled={!printer.supported || busy !== null}
          >
            {busy === "connect" ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <Usb className="me-2 h-4 w-4" />
            )}
            {printer.device ? "Reconnect" : "Connect printer"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onTestPrint}
            disabled={printer.status !== "ready" || busy !== null}
          >
            {busy === "test" && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            <RefreshCw className="me-2 h-4 w-4" />
            Test print
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              printer.disconnect();
              printer.forget();
              setGranted([]);
            }}
            disabled={!printer.device && granted.length === 0}
          >
            <Trash2 className="me-2 h-4 w-4" />
            Forget
          </Button>
        </div>

        {granted.length > 0 && (
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>Authorised by this browser:</p>
            <ul className="list-inside list-disc">
              {granted.map((d) => (
                <li key={d.key}>
                  {d.vendorName} {d.productName}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Printers connected over Wi-Fi, Ethernet or Bluetooth are not reachable
          from the browser. Use the browser print dialog for those, or install a
          print server on the network.
        </p>
      </CardContent>
    </Card>
  );
}


