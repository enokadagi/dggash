"use client";

import * as React from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";

/** Renders `value` as an inline, scalable QR code SVG. */
export function useQrSvg(value: string, margin = 1): string | null {
  const [svg, setSvg] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    if (!value) {
      setSvg(null);
      return;
    }

    QRCode.toString(value, {
      type: "svg",
      margin,
      errorCorrectionLevel: "M",
    })
      .then((result) => {
        // Only ever accept markup produced by the encoder itself.
        if (!cancelled && typeof result === "string" && result.trimStart().startsWith("<svg")) {
          setSvg(result);
        }
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });

    return () => {
      cancelled = true;
    };
  }, [value, margin]);

  return svg;
}

export function QrCode({
  value,
  className,
  label,
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const svg = useQrSvg(value);

  if (!svg) {
    return (
      <div
        className={cn("flex items-center justify-center rounded bg-muted text-[10px] text-muted-foreground", className)}
      >
        {value ? "QR unavailable" : "No code"}
      </div>
    );
  }

  return (
    <div
      className={cn("[&>svg]:h-full [&>svg]:w-full", className)}
      role="img"
      aria-label={label || "QR code"}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
