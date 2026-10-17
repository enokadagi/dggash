"use client";

import * as React from "react";
import { Check, CircleAlert, Dices, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarcodeScanner } from "@/components/barcode/barcode-scanner";
import {
  detectBarcodeFormat,
  generateInternalBarcode,
  isValidEan13,
  isValidUpcA,
  parseScannedValue,
} from "@/lib/barcode";
import { cn } from "@/lib/utils";

const FORMAT_LABEL: Record<string, string> = {
  ean13: "EAN-13",
  upca: "UPC-A",
  code128: "Code 128",
  unknown: "Unrecognised format",
};

export interface BarcodeFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Called when the value arrived from a scan rather than typing. */
  onScanned?: (value: string) => void;
  /** Message from the server when the code is already taken. */
  duplicateMessage?: string | null;
  disabled?: boolean;
  className?: string;
}

export function BarcodeField({
  id = "product-barcode",
  value,
  onChange,
  onScanned,
  duplicateMessage,
  disabled,
  className,
}: BarcodeFieldProps) {
  const [scannerOpen, setScannerOpen] = React.useState(false);

  const trimmed = value.trim();
  const format = detectBarcodeFormat(trimmed);
  const checkDigitProblem =
    (format === "ean13" && !isValidEan13(trimmed)) || (format === "upca" && !isValidUpcA(trimmed));

  const handleScanned = (code: string) => {
    // Scanning one of our product QR labels yields a JSON payload; reduce it to
    // the product identifier so lookup and storage stay consistent.
    const parsed = parseScannedValue(code);
    const value = parsed?.value ?? code;
    onChange(value);
    onScanned?.(value);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Scan or type a barcode"
          className="font-mono"
          autoComplete="off"
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={() => setScannerOpen(true)}
          disabled={disabled}
          title="Scan with camera or USB scanner"
        >
          <ScanLine className="h-4 w-4" />
          <span className="sr-only">Scan barcode</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          disabled={disabled}
          onClick={() => onChange(generateInternalBarcode())}
          title="Generate a valid EAN-13 barcode"
        >
          <Dices className="h-4 w-4" />
          <span className="sr-only">Generate barcode</span>
        </Button>
      </div>

      {trimmed && !duplicateMessage && (
        <p
          className={cn(
            "flex items-center gap-1 text-[11px]",
            checkDigitProblem ? "text-warning" : "text-muted-foreground"
          )}
        >
          {checkDigitProblem ? (
            <>
              <CircleAlert className="h-3 w-3" />
              {FORMAT_LABEL[format]} — the check digit does not match, double-check the code.
            </>
          ) : (
            <>
              <Check className="h-3 w-3" />
              {FORMAT_LABEL[format]} detected
            </>
          )}
        </p>
      )}

      {duplicateMessage && (
        <p className="flex items-start gap-1 text-[11px] text-destructive">
          <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          {duplicateMessage}
        </p>
      )}

      <BarcodeScanner open={scannerOpen} onOpenChange={setScannerOpen} onDetected={handleScanned} />
    </div>
  );
}
