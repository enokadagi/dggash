"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocalization } from "@/hooks/use-localization";
import {
  useImportProducts,
  type ProductImportRow,
  type ProductImportResult,
} from "@/hooks/api/use-products";
import { CircleAlert, CircleCheck, Download, FileUp } from "lucide-react";
import { toast } from "sonner";

const TEMPLATE_HEADERS = [
  "name",
  "sku",
  "barcode",
  "category",
  "purchasePrice",
  "sellingPrice",
  "currency",
  "initialStock",
  "minStock",
  "unit",
  "description",
  "isActive",
] as const;

const TEMPLATE_SAMPLE: Record<(typeof TEMPLATE_HEADERS)[number], string> = {
  name: "MikroTik hAP ac2",
  sku: "MIK-HAPAC2",
  barcode: "4710000000000",
  category: "Routers",
  purchasePrice: "45",
  sellingPrice: "69.99",
  currency: "USD",
  initialStock: "10",
  minStock: "2",
  unit: "piece",
  description: "Dual-band AC router",
  isActive: "TRUE",
};

const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  product: "name",
  "product name": "name",
  productname: "name",
  sku: "sku",
  code: "sku",
  barcode: "barcode",
  qr: "barcode",
  "barcode / qr value": "barcode",
  "barcode/qr": "barcode",
  category: "category",
  group: "category",
  purchaseprice: "purchasePrice",
  "purchase price": "purchasePrice",
  cost: "purchasePrice",
  sellingprice: "sellingPrice",
  "selling price": "sellingPrice",
  price: "sellingPrice",
  currency: "currency",
  initialstock: "initialStock",
  "initial stock": "initialStock",
  "opening stock": "initialStock",
  stock: "initialStock",
  minstock: "minStock",
  "min stock": "minStock",
  "minimum stock": "minStock",
  unit: "unit",
  description: "description",
  notes: "description",
  isactive: "isActive",
  active: "isActive",
};

type ParsedRow = {
  data: ProductImportRow;
  errors: string[];
};

function normalizeHeader(raw: string): string {
  return raw
    .replace(/^﻿/, "")
    .replace(/^"|"$/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function isTruthyFlag(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "1", "y", "active"].includes(normalized)) return "true";
  if (["false", "no", "0", "n", "inactive"].includes(normalized)) return "false";
  return value.trim();
}

function toRows(matrix: string[][]): { rows: ParsedRow[] } {
  if (matrix.length === 0) {
    return { rows: [] };
  }
  const header = matrix[0].map((cell) => normalizeHeader(cell));
  const keyByIndex: (string | null)[] = header.map((cell) => HEADER_ALIASES[cell] ?? null);

  const rows: ParsedRow[] = matrix.slice(1).map((cells) => {
    const data: ProductImportRow = {};
    const errors: string[] = [];
    keyByIndex.forEach((key, index) => {
      if (!key) return;
      const raw = (cells[index] ?? "").trim();
      if (raw === "") return;
      if (key === "isActive") {
        data.isActive = isTruthyFlag(raw);
        return;
      }
      (data as Record<string, string>)[key] = raw;
    });

    if (!data.name) errors.push("name");
    if (!data.sku) errors.push("sku");
    if (!data.category) errors.push("category");
    for (const priceField of ["purchasePrice", "sellingPrice"] as const) {
      const value = data[priceField];
      if (value === undefined || value === "") {
        errors.push(priceField);
        continue;
      }
      if (Number.isNaN(Number(value))) errors.push(`${priceField}:nan`);
      else if (Number(value) < 0) errors.push(`${priceField}:neg`);
    }
    for (const stockField of ["initialStock", "minStock"] as const) {
      const value = data[stockField];
      if (value === undefined || value === "") continue;
      if (Number.isNaN(Number(value))) errors.push(`${stockField}:nan`);
      else if (Number(value) < 0) errors.push(`${stockField}:neg`);
    }
    return { data, errors };
  });

  return { rows };
}

export interface ImportProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportProductsDialog({ open, onOpenChange }: ImportProductsDialogProps) {
  const { t } = useLocalization();
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [parsed, setParsed] = React.useState<ParsedRow[]>([]);
  const [rawRowCount, setRawRowCount] = React.useState(0);
  const [result, setResult] = React.useState<ProductImportResult | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const importProducts = useImportProducts();

  React.useEffect(() => {
    if (open) return;
    setFileName(null);
    setParsed([]);
    setRawRowCount(0);
    setResult(null);
    setParsing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [open]);

  const downloadTemplate = () => {
    const header = TEMPLATE_HEADERS.join(",");
    const sample = TEMPLATE_HEADERS.map((key) => {
      const value = TEMPLATE_SAMPLE[key];
      return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    }).join(",");
    const csv = `${header}\n${sample}\n`;
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory-import-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setParsing(true);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const matrix = parseCsv(text);
      const { rows } = toRows(matrix);
      setRawRowCount(Math.max(0, matrix.length - 1));
      setParsed(rows);
      setParsing(false);
      if (rows.length === 0) {
        toast.error(t("inventoryPage.import.noRows"));
      }
    };
    reader.onerror = () => {
      setParsing(false);
      setParsed([]);
      toast.error(t("inventoryPage.import.parseFailed"));
    };
    reader.readAsText(file, "utf-8");
  };

  const validRows = parsed.filter((row) => row.errors.length === 0);
  const invalidRows = parsed.filter((row) => row.errors.length > 0);
  const canImport = validRows.length > 0 && !importProducts.isPending;

  const handleImport = () => {
    if (!canImport) return;
    importProducts.mutate(validRows.map((row) => row.data), {
      onSuccess: (data) => {
        setResult(data);
        if (data.imported > 0) {
          toast.success(t("inventoryPage.import.importedToast", { count: data.imported }));
        }
        if (data.failed > 0) {
          toast.error(t("inventoryPage.import.failedToast", { count: data.failed }));
        }
      },
      onError: (error: { message?: string }) =>
        toast.error(error.message || t("inventoryPage.import.importFailed")),
    });
  };

  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("inventoryPage.import.title")}</DialogTitle>
          <DialogDescription>{t("inventoryPage.import.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-dashed p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{t("inventoryPage.import.templateHint")}</p>
              <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="me-1.5 h-3.5 w-3.5" />
                {t("inventoryPage.import.downloadTemplate")}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="import-csv" className="text-xs font-medium text-muted-foreground">
              {t("inventoryPage.import.fileLabel")}
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                id="import-csv"
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFile}
              />
              <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                <FileUp className="me-1.5 h-3.5 w-3.5" />
                {t("inventoryPage.import.chooseFile")}
              </Button>
              {fileName && (
                <span className="text-xs text-muted-foreground">
                  {t("inventoryPage.import.fileChosen", { name: fileName })}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("inventoryPage.import.requiredColumns")} · {t("inventoryPage.import.maxRows")}
            </p>
          </div>

          {parsing && <p className="text-xs text-muted-foreground">{t("inventoryPage.import.parsing")}</p>}

          {!parsing && parsed.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">
                  {t("inventoryPage.import.rowsReady", { count: validRows.length })}
                </Badge>
                {invalidRows.length > 0 && (
                  <Badge variant="destructive">
                    {t("inventoryPage.import.rowsWithProblems", { count: invalidRows.length })}
                  </Badge>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {t("inventoryPage.import.fileRows", { count: rawRowCount })}
                </span>
              </div>

              <div className="max-h-56 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/50">
                    <tr className="text-start">
                      <th className="px-2 py-1.5 text-start font-medium">{t("inventoryPage.import.row")}</th>
                      <th className="px-2 py-1.5 text-start font-medium">{t("inventoryPage.product")}</th>
                      <th className="px-2 py-1.5 text-start font-medium">SKU</th>
                      <th className="px-2 py-1.5 text-start font-medium">{t("inventoryPage.category")}</th>
                      <th className="px-2 py-1.5 text-start font-medium">{t("inventoryPage.sellingPrice")}</th>
                      <th className="px-2 py-1.5 text-start font-medium">{t("inventoryPage.import.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 50).map((row, index) => (
                      <tr key={index} className="border-t">
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{index + 1}</td>
                        <td className="px-2 py-1.5">{row.data.name || "—"}</td>
                        <td className="px-2 py-1.5 font-mono">{row.data.sku || "—"}</td>
                        <td className="px-2 py-1.5">{row.data.category || "—"}</td>
                        <td className="px-2 py-1.5 tabular-nums">{row.data.sellingPrice ?? "—"}</td>
                        <td className="px-2 py-1.5">
                          {row.errors.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-success">
                              <CircleCheck className="h-3 w-3" />
                              {t("inventoryPage.import.ready")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-destructive">
                              <CircleAlert className="h-3 w-3" />
                              {row.errors
                                .map((error) => {
                                  if (error === "name" || error === "sku" || error === "category") {
                                    return `${t("inventoryPage.import.requiredField")}: ${error}`;
                                  }
                                  const [field, kind] = error.split(":");
                                  if (kind === "nan") {
                                    return `${field}: ${t("inventoryPage.import.invalidNumber")}`;
                                  }
                                  if (kind === "neg") {
                                    return `${field}: ${t("inventoryPage.import.negativeNumber")}`;
                                  }
                                  return `${field}: ${t("inventoryPage.import.invalidNumber")}`;
                                })
                                .join(", ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.length > 50 && (
                <p className="text-[11px] text-muted-foreground">
                  {t("inventoryPage.import.previewTruncated", { count: parsed.length })}
                </p>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <CircleCheck className="h-4 w-4 text-success" />
                <p className="text-sm font-medium">{t("inventoryPage.import.importedTitle")}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("inventoryPage.import.importedSummary", {
                  imported: result.imported,
                  total: result.total,
                  failed: result.failed,
                })}
              </p>
              {result.createdCategories.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("inventoryPage.import.createdCategories", {
                    list: result.createdCategories.join(", "),
                  })}
                </p>
              )}
              {result.results.some((row) => row.status === "failed") && (
                <ul className="max-h-32 space-y-1 overflow-auto">
                  {result.results
                    .filter((row) => row.status === "failed")
                    .map((row) => (
                      <li key={row.row} className="text-[11px] text-destructive">
                        {t("inventoryPage.import.failedRow", { row: row.row, error: row.error ?? "" })}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={importProducts.isPending}>
            {result ? t("inventoryPage.import.done") : t("common.cancel")}
          </Button>
          {!result && (
            <Button onClick={handleImport} disabled={!canImport}>
              {importProducts.isPending
                ? t("inventoryPage.import.importing")
                : t("inventoryPage.import.importNow", { count: validRows.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
