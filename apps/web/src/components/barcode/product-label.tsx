"use client";

import * as React from "react";
import { Download, Printer } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { buildQrText, code128ToSvg, type ProductQrData } from "@/lib/barcode";
import { formatCurrency, slugify } from "@/lib/utils";

export interface ProductLabelData extends ProductQrData {
  name: string;
  sku: string;
  price: number;
  currency?: string;
}

interface PreparedLabel extends ProductLabelData {
  /** Inline SVG markup produced by the encoder (already safe markup). */
  qrSvg: string;
  barcodeSvg: string;
}

async function qrToSvg(value: string): Promise<string> {
  const svg = await QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return typeof svg === "string" && svg.trimStart().startsWith("<svg") ? svg : "";
}

function barcodeToSvg(value?: string | null): string {
  if (!value) return "";
  try {
    return code128ToSvg(value, { moduleWidth: 2, height: 46 });
  } catch {
    // Non Code 128 encodable values (e.g. a raw QR payload) simply have no
    // printed linear barcode; the human readable value below stays correct.
    return "";
  }
}

async function prepareLabel(data: ProductLabelData): Promise<PreparedLabel> {
  const hasCode = Boolean(data.barcode || data.sku);
  return {
    ...data,
    qrSvg: hasCode ? await qrToSvg(buildQrText(data)) : "",
    barcodeSvg: barcodeToSvg(data.barcode),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function labelMarkup(label: PreparedLabel): string {
  const { qrSvg, barcodeSvg } = label;
  return `<div style="width:260px;border:1px solid #111;background:#fff;color:#000;padding:8px">
  <div style="text-align:center">
    <div style="font-weight:700;font-size:13px;line-height:1.15">${escapeHtml(label.name)}</div>
    <div style="font-family:ui-monospace,monospace;font-size:10px">${escapeHtml(label.sku)}</div>
  </div>
  <div style="height:46px;margin:6px 0 2px;color:#000">${
    barcodeSvg
      ? `<span style="display:block;height:100%;width:100%">${barcodeSvg}</span>`
      : ""
  }</div>
  <div style="text-align:center;font-family:ui-monospace,monospace;font-size:11px">${escapeHtml(
    label.barcode || "—"
  )}</div>
  ${qrSvg ? `<div style="width:64px;height:64px;margin:4px auto 0">${qrSvg}</div>` : ""}
  <div style="border-top:1px solid #ddd;margin-top:4px;padding-top:4px;text-align:center;font-weight:700;font-size:12px">${escapeHtml(
    formatCurrency(label.price, label.currency || "USD")
  )}</div>
</div>`;
}

function buildPrintDocument(labels: PreparedLabel[]): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Labels - ${escapeHtml(labels[0]?.name || "product")}</title>
<style>
  @page { margin: 6mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #eef2f7; }
  .sheet { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 4mm; padding: 4mm; }
  @media print { body { background: #fff; } .sheet { padding: 0; gap: 2mm; } }
</style>
</head>
<body>
  <div class="sheet">${labels.map(labelMarkup).join("")}</div>
  <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
</body>
</html>`;
}

async function openPrintWindow(labels: PreparedLabel[]) {
  const windowRef = window.open("", "_blank", "width=680,height=820");
  if (!windowRef) {
    throw new Error("Popup blocked. Allow popups for this site to print labels.");
  }
  windowRef.document.open();
  windowRef.document.write(buildPrintDocument(labels));
  windowRef.document.close();
}

/** On-screen label preview (QR + Code 128 + price). */
export function ProductLabel({ data }: { data: ProductLabelData }) {
  const [label, setLabel] = React.useState<PreparedLabel | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    prepareLabel(data).then((result) => {
      if (!cancelled) setLabel(result);
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (!label) {
    return <div className="h-[190px] w-[260px] animate-pulse rounded bg-muted" />;
  }

  return (
    <div className="w-[260px] rounded-sm border border-black/80 bg-white p-2 text-black">
      <div className="text-center">
        <p className="truncate text-[13px] font-bold leading-tight">{data.name}</p>
        <p className="font-mono text-[10px] leading-tight">{data.sku}</p>
      </div>

      <div className="mx-auto my-1.5 h-[46px] w-full">
        {label.barcodeSvg ? (
          <span
            className="block h-full w-full"
            role="img"
            aria-label={`Barcode ${data.barcode}`}
            dangerouslySetInnerHTML={{ __html: label.barcodeSvg }}
          />
        ) : (
          <p className="pt-3 text-center text-[10px]">No printable barcode</p>
        )}
      </div>

      <p className="text-center font-mono text-[11px] tracking-wide">{data.barcode || "—"}</p>

      {label.qrSvg && (
        <div
          className="mx-auto mt-1 h-[64px] w-[64px]"
          role="img"
          aria-label="Product QR code"
          dangerouslySetInnerHTML={{ __html: label.qrSvg }}
        />
      )}

      <p className="mt-1 border-t border-black/20 pt-1 text-center text-[12px] font-bold">
        {formatCurrency(data.price, data.currency || "USD")}
      </p>
    </div>
  );
}

export function PrintLabelButton({
  data,
  copies = 1,
  variant = "default",
  size = "default",
  className,
  onError,
}: {
  data: ProductLabelData;
  copies?: number;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
  className?: string;
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);

  const handlePrint = async () => {
    setBusy(true);
    try {
      const count = Math.max(1, Math.min(99, copies));
      const first = await prepareLabel(data);
      const labels = Array.from({ length: count }, () => first);
      await openPrintWindow(labels);
    } catch (error) {
      onError?.((error as Error)?.message || "Could not open the print window");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={handlePrint}
      disabled={busy}
      title="Print label (pick 'Save as PDF' to download)"
    >
      <Printer className="h-4 w-4" />
      {size !== "icon" && <span className="ms-2">{busy ? "Opening…" : "Print label"}</span>}
    </Button>
  );
}

/** Downloads the product QR code as an SVG file. */
export function DownloadQrButton({
  data,
  className,
  onError,
}: {
  data: ProductLabelData;
  className?: string;
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);

  const handleDownload = async () => {
    setBusy(true);
    try {
      const svg = await qrToSvg(buildQrText(data));
      if (!svg) throw new Error("Could not generate the QR code");
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slugify(data.sku) || "product"}-qr.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      onError?.((error as Error)?.message || "Could not download the QR code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" className={className} onClick={handleDownload} disabled={busy}>
      <Download className="me-2 h-4 w-4" />
      {busy ? "Preparing…" : "Download QR"}
    </Button>
  );
}
