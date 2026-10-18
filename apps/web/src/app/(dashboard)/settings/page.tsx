"use client";

import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocalization } from "@/hooks/use-localization";
import CompanySettingsPage from "./company/page";
import PrintDesignPage from "./print/page";
import ProfilePage from "./profile/page";
import BackupsSettingsPage from "./backups/page";
import { CategoryManager } from "@/components/settings/category-manager";
import { Building2, Printer, Tag, User, Database } from "lucide-react";

export default function SettingsPage() {
  const { t } = useLocalization();
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settingsPage.title")}
        description={t("settingsPage.description")}
      />
      <Tabs defaultValue="company" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
          <TabsTrigger value="company" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span>{t("settings.company")}</span>
          </TabsTrigger>
          <TabsTrigger value="print" className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            <span>{t("settingsPage.tabPrint")}</span>
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            <span>{t("settingsPage.tabCategories")}</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>{t("settingsPage.tabProfile")}</span>
          </TabsTrigger>
          <TabsTrigger value="backups" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            <span>{t("settings.backups")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <CompanySettingsPage />
        </TabsContent>

        <TabsContent value="print">
          <PrintDesignPage />
        </TabsContent>

        <TabsContent value="categories">
          <CategoryManager />
        </TabsContent>

        <TabsContent value="profile">
          <ProfilePage />
        </TabsContent>

        <TabsContent value="backups">
          <BackupsSettingsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}