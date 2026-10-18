import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./i18n/locales/en.json";
import ar from "./i18n/locales/ar.json";

const STORAGE_KEY = "awik-locale";

function getInitialLocale(): string {
  if (typeof window === "undefined") return "ar";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "ar") return saved;
  } catch {
    // ignore
  }
  return "ar";
}

const initialLocale = getInitialLocale();

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: initialLocale,
  fallbackLng: "ar",
  supportedLngs: ["ar", "en"],
  interpolation: {
    escapeValue: false,
  },
});

export function applyDocumentLocale(locale: string) {
  if (typeof document === "undefined") return;
  const dir = locale === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = locale;
  document.documentElement.dir = dir;
}

export function persistLocale(locale: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
  applyDocumentLocale(locale);
}

applyDocumentLocale(initialLocale);

export default i18n;
