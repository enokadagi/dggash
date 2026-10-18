"use client";

import { useTranslation } from "react-i18next";
import { persistLocale } from "@/lib/i18n";

export function useLocalization() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as "ar" | "en";
  const direction: "rtl" | "ltr" = locale === "ar" ? "rtl" : "ltr";

  const changeLocale = (next: "ar" | "en") => {
    i18n.changeLanguage(next);
    persistLocale(next);
  };

  return {
    locale,
    direction,
    isRTL: direction === "rtl",
    t,
    changeLocale,
  };
}
