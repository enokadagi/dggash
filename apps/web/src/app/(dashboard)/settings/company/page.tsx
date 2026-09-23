"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingState, ErrorState } from "@/components/ui/status-states";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { Save, CheckCircle2, AlertCircle } from "lucide-react";

interface SettingEntry {
  key: string;
  value: string;
}

const DEFAULTS: Record<string, string> = {
  "company.name": "",
  "company.address": "",
  "company.phone": "",
  "company.currency": "USD",
};

export default function CompanySettingsPage() {
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
      setError(err.message || "Failed to save company settings");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <LoadingState message="Loading company settings..." />;
  if (fetchError) return <ErrorState message={(fetchError as Error).message} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Settings"
        description="Manage company information and preferences"
        actions={
          <Button onClick={handleSave} disabled={saving}>
            <Save className="me-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        }
      />
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          Company settings saved successfully
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
          <CardTitle className="text-base">Company Information</CardTitle>
          <CardDescription>Update your company details and preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={form["company.name"]}
                onChange={(e) => updateField("company.name", e.target.value)}
                placeholder="AWIK NET ISP"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={form["company.phone"]}
                onChange={(e) => updateField("company.phone", e.target.value)}
                placeholder="+1234567890"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={form["company.currency"]}
                onChange={(e) => updateField("company.currency", e.target.value)}
                placeholder="USD"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={form["company.address"]}
              onChange={(e) => updateField("company.address", e.target.value)}
              placeholder="123 Main St, City, Country"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
