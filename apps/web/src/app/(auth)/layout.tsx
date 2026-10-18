"use client";

import * as React from "react";
import { useLocalization } from "@/hooks/use-localization";
import { useCompanyBranding } from "@/hooks/api/use-company-settings";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useLocalization();
  const { data: company } = useCompanyBranding();

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted/30">
      <div className="absolute end-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="flex flex-col items-center text-center">
          {company?.logo ? (
            <img
              src={company.logo}
              alt={company.name || t("common.appName")}
              className="mb-2 h-14 w-14 rounded-xl object-contain"
            />
          ) : (
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg">
              AW
            </div>
          )}
          <h1 className="text-2xl font-bold tracking-tight">
            {company?.name || t("common.appName")}
          </h1>
          {company?.tagline ? (
            <p className="text-sm text-muted-foreground">{company.tagline}</p>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
