"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface PrintSettingsA4 {
  showLogo: boolean;
  showSku: boolean;
  showBarcode: boolean;
  showTax: boolean;
  showDiscount: boolean;
  footerText: string;
  marginTop: string;
  marginBottom: string;
  marginLeft: string;
  marginRight: string;
}

export interface PrintSettingsThermal {
  paperWidth: "58" | "80";
  autoPrint: boolean;
  showLogo: boolean;
  includeQr: boolean;
  footerMessage: string;
}

export interface PrintSettings {
  a4: PrintSettingsA4;
  thermal: PrintSettingsThermal;
}

const A4_DEFAULTS: PrintSettingsA4 = {
  showLogo: true,
  showSku: true,
  showBarcode: false,
  showTax: false,
  showDiscount: false,
  footerText: "Thank you for your business",
  marginTop: "12",
  marginBottom: "12",
  marginLeft: "14",
  marginRight: "14",
};

const THERMAL_DEFAULTS: PrintSettingsThermal = {
  paperWidth: "80",
  autoPrint: false,
  showLogo: false,
  includeQr: true,
  footerMessage: "Thank you for your business",
};

function toBool(value: unknown): boolean {
  return String(value ?? "false").toLowerCase() === "true";
}

function toPaperWidth(value: unknown): "58" | "80" {
  const v = String(value ?? "80").trim();
  return v === "58" ? "58" : "80";
}

export function usePrintSettings() {
  const query = useQuery({
    queryKey: ["print-settings"],
    queryFn: async () => {
      const raw = await api.get<{ key: string; value: string }[]>("/settings");
      const entries = Array.isArray(raw) ? raw : [];
      const map: Record<string, string> = {};
      for (const entry of entries) map[entry.key] = entry.value ?? "";

      const a4: PrintSettingsA4 = {
        showLogo: toBool(map["print.a4.showLogo"] ?? A4_DEFAULTS.showLogo),
        showSku: toBool(map["print.a4.showSku"] ?? A4_DEFAULTS.showSku),
        showBarcode: toBool(map["print.a4.showBarcode"] ?? A4_DEFAULTS.showBarcode),
        showTax: toBool(map["print.a4.showTax"] ?? A4_DEFAULTS.showTax),
        showDiscount: toBool(map["print.a4.showDiscount"] ?? A4_DEFAULTS.showDiscount),
        footerText: map["print.a4.footerText"] ?? A4_DEFAULTS.footerText,
        marginTop: map["print.a4.marginTop"] ?? A4_DEFAULTS.marginTop,
        marginBottom: map["print.a4.marginBottom"] ?? A4_DEFAULTS.marginBottom,
        marginLeft: map["print.a4.marginLeft"] ?? A4_DEFAULTS.marginLeft,
        marginRight: map["print.a4.marginRight"] ?? A4_DEFAULTS.marginRight,
      };

      const thermal: PrintSettingsThermal = {
        paperWidth: toPaperWidth(map["print.thermal.paperWidth"]),
        autoPrint: toBool(map["print.thermal.autoPrint"] ?? THERMAL_DEFAULTS.autoPrint),
        showLogo: toBool(map["print.thermal.showLogo"] ?? THERMAL_DEFAULTS.showLogo),
        includeQr: toBool(map["print.thermal.includeQr"] ?? THERMAL_DEFAULTS.includeQr),
        footerMessage: map["print.thermal.footerMessage"] ?? THERMAL_DEFAULTS.footerMessage,
      };

      return { a4, thermal } as PrintSettings;
    },
    staleTime: 60_000,
    retry: 1,
  });

  return query;
}