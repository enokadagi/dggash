"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface CompanySettingEntry {
  key: string;
  value: string;
  description?: string | null;
}

/**
 * Company identity used on printed documents (A4 invoices).
 *
 * Every field is optional and read from `company_settings`. Nothing is invented:
 * a field the administrator has not filled in renders as empty rather than
 * showing a placeholder that could be mistaken for real company data.
 */
export interface CompanyProfile {
  name: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  taxId: string;
  /** Data URL or same-origin path. Empty when no logo has been uploaded. */
  logo: string;
  currency: string;
}

/** Settings keys that make up a printed document header. */
const COMPANY_KEYS = [
  "company.name",
  "company.tagline",
  "company.phone",
  "company.email",
  "company.address",
  "company.website",
  "company.taxId",
  "company.logo",
  "company.currency",
] as const;

export function useCompanyProfile() {
  const query = useQuery({
    queryKey: ["company-profile"],
    queryFn: async () => {
      const raw = await api.get<CompanySettingEntry[]>("/settings");
      const entries = Array.isArray(raw) ? raw : [];
      const map: Record<string, string> = {};
      for (const entry of entries) map[entry.key] = entry.value ?? "";

      const profile: CompanyProfile = {
        name: map["company.name"] ?? "",
        tagline: map["company.tagline"] ?? "",
        phone: map["company.phone"] ?? "",
        email: map["company.email"] ?? "",
        address: map["company.address"] ?? "",
        website: map["company.website"] ?? "",
        taxId: map["company.taxId"] ?? "",
        logo: map["company.logo"] ?? "",
        currency: map["company.currency"] ?? "USD",
      };
      return profile;
    },
    // Company identity changes rarely; a stale header on a reprint is fine and
    // this avoids a request on every POS render.
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return query;
}

export interface CompanyBranding {
  name: string;
  tagline: string;
  logo: string;
}

/**
 * Public company branding (name / tagline / logo) for unauthenticated screens
 * such as the login page. Backed by `GET /company/branding`, which requires no
 * auth — using the authenticated `/settings` endpoint here would 401, trip the
 * global 401 handler's hard redirect, and abort the login request mid-flight.
 */
export function useCompanyBranding() {
  return useQuery({
    queryKey: ["company-branding"],
    queryFn: () =>
      api.get<CompanyBranding>("/company/branding"),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export const COMPANY_SETTING_KEYS = COMPANY_KEYS;
