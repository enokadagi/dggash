"use client";

import * as React from "react";
import { Languages, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocalization } from "@/hooks/use-localization";

const OPTIONS: Array<{ code: "ar" | "en"; label: string }> = [
  { code: "ar", label: "العربية" },
  { code: "en", label: "English" },
];

export function LanguageSwitcher() {
  const { locale, changeLocale } = useLocalization();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change language">
          <Languages className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.code}
            onClick={() => changeLocale(option.code)}
            className="flex items-center justify-between"
          >
            <span>{option.label}</span>
            {locale === option.code ? <Check className="h-4 w-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
