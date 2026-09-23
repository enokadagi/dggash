"use client";

import { useTranslation } from "react-i18next";

export function useLocalization() {
  const { t } = useTranslation();

  return {
    locale: "en" as const,
    direction: "ltr" as const,
    t,
    changeLocale: () => {},
    isRTL: false,
  };
}