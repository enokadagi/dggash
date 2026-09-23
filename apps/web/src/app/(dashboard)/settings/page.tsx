"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalization } from "@/hooks/use-localization";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/status-states";
import { Save } from "lucide-react";
import { api } from "@/lib/api";

interface SettingEntry {
  key: string;
  value: string;
}

const COMPANY_KEYS: Array<{ key: string; field: string; label: string }> = [
  { key: "company.name", field: "name", label: "Company Name" },
  { key: "company.phone", field: "phone", label: "Phone" },
  { key: "company.currency", field: "currency", label: "Currency" },
  { key: "company.address", field: "address", label: "Address" },
];

const DEFAULTS: Record<string, string> = {
  name: "",
  phone: "",
  currency: "USD",
  address: "",
};

export default function SettingsPage() {
  const { t } = useLocalization();
  const [company, setCompany] = React.useState<Record<string, string>>(DEFAULTS);
  const [saving, setSaving] = React.useState(false);
  const [initialized, setInitialized] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const raw = await api.get<SettingEntry[]>("/settings");
      return Array.isArray(raw) ? raw : [];
    },
  });

  React.useEffect(() => {
    if (data && !initialized) {
      const map: Record<string, string> = {};
      for (const entry of data) {
        map[entry.key] = entry.value || "";
      }
      const next: Record<string, string> = { ...DEFAULTS };
      for (const { key, field } of COMPANY_KEYS) {
        if (map[key]) next[field] = map[key];
      }
      setCompany(next);
      setInitialized(true);
    }
  }, [data, initialized]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        COMPANY_KEYS.map(({ key, field }) =>
          api.patch(`/settings/${key}`, { value: company[field] || "" })
        )
      );
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setCompany((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading) return <LoadingState message="Loading settings..." />;

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} />
      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company">{t("settings.company")}</TabsTrigger>
          <TabsTrigger value="backups">{t("settings.backups")}</TabsTrigger>
        </TabsList>
        <TabsContent value="company" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("settings.company")}</CardTitle>
              <CardDescription>Company information and preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("settings.companyName")}</Label>
                  <Input placeholder="Company Name" value={company.name || ""} onChange={(e) => updateField("name", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.companyPhone")}</Label>
                  <Input type="tel" placeholder="+1234567890" value={company.phone || ""} onChange={(e) => updateField("phone", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.currency")}</Label>
                  <Input placeholder="USD" value={company.currency || ""} onChange={(e) => updateField("currency", e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("settings.companyAddress")}</Label>
                <Input placeholder="123 Main St, City, Country" value={company.address || ""} onChange={(e) => updateField("address", e.target.value)} />
              </div>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="me-2 h-4 w-4" />
                {saving ? "Saving..." : t("common.save")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="backups" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("settings.backups")}</CardTitle>
              <CardDescription>Manage database backups</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="py-8 text-center text-sm text-muted-foreground">No recent backups</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}