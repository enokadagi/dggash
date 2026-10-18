"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingState, ErrorState } from "@/components/ui/status-states";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PrinterSetup } from "@/components/printer/printer-setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useLocalization } from "@/hooks/use-localization";
import { Save, CheckCircle2, AlertCircle } from "lucide-react";

interface SettingEntry {
  key: string;
  value: string;
}

const DEFAULTS: Record<string, string> = {
  "company.name": "",
  "company.tagline": "",
  "company.address": "",
  "company.phone": "",
  "company.whatsapp": "",
  "company.email": "",
  "company.website": "",
  "company.taxId": "",
  "company.logo": "",
  "company.currency": "USD",
  "company.timezone": "Asia/Beirut",
};

export default function CompanySettingsPage() {
  const { t } = useLocalization();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [form, setForm] = React.useState<Record<string, string>>(DEFAULTS);
  const [initialized, setInitialized] = React.useState(false);

  const { data, isLoading, error: fetchError, refetch } = useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const raw = await api.get<SettingEntry[]>("/settings");
      const entries = Array.isArray(raw) ? raw : [];
      return entries;
    },
  });

  React.useEffect(() => {
    if (data && !initialized) {
      const map: Record<string, string> = { ...DEFAULTS };
      for (const entry of data) {
        if (entry.key in map) map[entry.key] = entry.value || "";
      }
      setForm(map);
      setInitialized(true);
    }
  }, [data, initialized]);

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await Promise.all(
        Object.entries(form).map(([key, value]) =>
          api.patch(`/settings/${key}`, { value })
        )
      );
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || t("settingsPage.company.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <LoadingState message={t("settingsPage.company.loading")} />;
  if (fetchError) return <ErrorState message={(fetchError as Error).message} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settingsPage.company.title")}
        description={t("settingsPage.company.description")}
        actions={
          <Button onClick={handleSave} disabled={saving}>
            <Save className="me-2 h-4 w-4" />
            {saving ? t("settingsPage.saving") : t("profile.saveChanges")}
          </Button>
        }
      />
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          {t("settingsPage.company.savedSuccess")}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settingsPage.company.infoTitle")}</CardTitle>
          <CardDescription>{t("settingsPage.company.infoDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyName">{t("settings.companyName")}</Label>
              <Input
                id="companyName"
                value={form["company.name"]}
                onChange={(e) => updateField("company.name", e.target.value)}
                placeholder="AWIK NET ISP"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tagline">{t("settingsPage.company.tagline")}</Label>
              <Input
                id="tagline"
                value={form["company.tagline"]}
                onChange={(e) => updateField("company.tagline", e.target.value)}
                placeholder={t("settingsPage.company.phTagline")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t("settingsPage.company.phone")}</Label>
              <Input
                id="phone"
                type="tel"
                value={form["company.phone"]}
                onChange={(e) => updateField("company.phone", e.target.value)}
                placeholder="+96170000000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsapp">{t("settingsPage.company.whatsappNumber")}</Label>
              <Input
                id="whatsapp"
                type="tel"
                value={form["company.whatsapp"]}
                onChange={(e) => updateField("company.whatsapp", e.target.value)}
                placeholder="+96170000000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                value={form["company.email"]}
                onChange={(e) => updateField("company.email", e.target.value)}
                placeholder="info@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">{t("settingsPage.company.website")}</Label>
              <Input
                id="website"
                value={form["company.website"]}
                onChange={(e) => updateField("company.website", e.target.value)}
                placeholder="https://yourcompany.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxId">{t("settingsPage.company.taxId")}</Label>
              <Input
                id="taxId"
                value={form["company.taxId"]}
                onChange={(e) => updateField("company.taxId", e.target.value)}
                placeholder="123456789"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="logo">{t("settingsPage.company.logoUrl")}</Label>
              <Input
                id="logo"
                value={form["company.logo"]}
                onChange={(e) => updateField("company.logo", e.target.value)}
                placeholder="https://yourcompany.com/logo.png"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">{t("settings.currency")}</Label>
              <Input
                id="currency"
                value={form["company.currency"]}
                onChange={(e) => updateField("company.currency", e.target.value)}
                placeholder="USD"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">{t("settings.timezone")}</Label>
              <Input
                id="timezone"
                value={form["company.timezone"]}
                onChange={(e) => updateField("company.timezone", e.target.value)}
                placeholder="Asia/Beirut"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">{t("settingsPage.company.address")}</Label>
            <Input
              id="address"
              value={form["company.address"]}
              onChange={(e) => updateField("company.address", e.target.value)}
              placeholder={t("settingsPage.company.phAddress")}
            />
          </div>
        </CardContent>
      </Card>

      <PrinterSetup />
    </div>
  );
}
