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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { A4Invoice, type InvoiceSale } from "@/components/invoice/a4-invoice";
import { api } from "@/lib/api";
import { useLocalization } from "@/hooks/use-localization";
import { Save, CheckCircle2, AlertCircle, Printer, Eye, FileText, ReceiptText } from "lucide-react";

interface SettingEntry {
  key: string;
  value: string;
}

const DEFAULTS: Record<string, string> = {
  "print.a4.showLogo": "true",
  "print.a4.showSku": "true",
  "print.a4.showBarcode": "false",
  "print.a4.showTax": "false",
  "print.a4.showDiscount": "false",
  "print.a4.footerText": "Thank you for your business",
  "print.a4.marginTop": "12",
  "print.a4.marginBottom": "12",
  "print.a4.marginLeft": "14",
  "print.a4.marginRight": "14",
  "print.thermal.paperWidth": "80",
  "print.thermal.autoPrint": "false",
  "print.thermal.showLogo": "false",
  "print.thermal.includeQr": "true",
  "print.thermal.footerMessage": "Thank you for your business",
};

const SAMPLE_SALE: InvoiceSale = {
  id: "sample-sale-preview",
  saleNumber: "S-20261008-001234",
  totalAmount: 145.5,
  currency: "USD",
  paymentMethod: "CASH",
  status: "PAID",
  notes: "Sample preview sale for layout verification.",
  createdAt: new Date().toISOString(),
  customer: {
    firstName: "Ahmad",
    lastName: "Hassan",
    phone: "+961 70 123 456",
    email: "ahmad.hassan@example.com",
    address: "Tripoli, Al-Mina, Lebanon",
  },
  user: {
    firstName: "System",
    lastName: "Administrator",
  },
  items: [
    {
      id: "item-1",
      quantity: 1,
      unitPrice: 95.0,
      totalPrice: 95.0,
      discount: 5.0,
      tax: 10.0,
      product: {
        name: "MikroTik hEX S Router (Gigabit)",
        sku: "RB760IGS",
        barcode: "4752224003295",
        unit: "piece",
      },
    },
    {
      id: "item-2",
      quantity: 2,
      unitPrice: 25.0,
      totalPrice: 50.0,
      discount: 0,
      tax: 5.5,
      product: {
        name: "Cat6 Outdoor FTP Cable (30m Roll)",
        sku: "CAB-CAT6-OUT-30",
        barcode: "8430308032205",
        unit: "piece",
      },
    },
    {
      id: "item-3",
      quantity: 1,
      unitPrice: 5.5,
      totalPrice: 5.5,
      discount: 0,
      tax: 0,
      product: {
        name: "RJ45 Shielded Connectors (Pack of 10)",
        sku: "CONN-RJ45-P10",
        barcode: "7729104820124",
        unit: "pack",
      },
    },
  ],
};

export default function PrintDesignPage() {
  const { t } = useLocalization();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [form, setForm] = React.useState<Record<string, string>>(DEFAULTS);
  const [initialized, setInitialized] = React.useState(false);
  const [previewTab, setPreviewTab] = React.useState<"a4" | "thermal">("a4");

  const { data, isLoading, error: fetchError, refetch } = useQuery({
    queryKey: ["print-settings"],
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
        if (entry.key in map) map[entry.key] = entry.value || map[entry.key];
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
      setError(err.message || t("settingsPage.print.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handlePrintTest = () => {
    window.print();
  };

  if (isLoading) return <LoadingState message={t("settingsPage.print.loading")} />;
  if (fetchError) return <ErrorState message={(fetchError as Error).message} onRetry={refetch} />;

  const sampleCompany = {
    name: "AWIK NET",
    tagline: "INTERNET SERVICE PROVIDER",
    phone: "+961 70 000 000",
    email: "contact@awiknet.com",
    address: "Main Street, Tripoli, Lebanon",
    website: "www.awiknet.com",
    taxId: "LB-99218204",
    logo: "",
    currency: "USD",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settingsPage.print.title")}
        description={t("settingsPage.print.description")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handlePrintTest}>
              <Printer className="me-2 h-4 w-4" />
              {t("settingsPage.print.printTest")}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="me-2 h-4 w-4" />
              {saving ? t("settingsPage.saving") : t("profile.saveChanges")}
            </Button>
          </div>
        }
      />
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          {t("settingsPage.print.savedSuccess")}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Grid: Settings on Left/Top, Live Preview on Right/Bottom */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {t("settingsPage.print.a4Title")}
              </CardTitle>
              <CardDescription>{t("settingsPage.print.a4Description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="a4Logo">{t("settingsPage.print.showLogo")}</Label>
                    <Switch
                      id="a4Logo"
                      checked={form["print.a4.showLogo"] === "true"}
                      onCheckedChange={(checked) =>
                        updateField("print.a4.showLogo", checked ? "true" : "false")
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="a4Sku">{t("settingsPage.print.showSku")}</Label>
                    <Switch
                      id="a4Sku"
                      checked={form["print.a4.showSku"] === "true"}
                      onCheckedChange={(checked) =>
                        updateField("print.a4.showSku", checked ? "true" : "false")
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="a4Barcode">{t("settingsPage.print.showBarcode")}</Label>
                    <Switch
                      id="a4Barcode"
                      checked={form["print.a4.showBarcode"] === "true"}
                      onCheckedChange={(checked) =>
                        updateField("print.a4.showBarcode", checked ? "true" : "false")
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="a4Tax">{t("settingsPage.print.showTax")}</Label>
                    <Switch
                      id="a4Tax"
                      checked={form["print.a4.showTax"] === "true"}
                      onCheckedChange={(checked) =>
                        updateField("print.a4.showTax", checked ? "true" : "false")
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="a4Discount">{t("settingsPage.print.showDiscount")}</Label>
                    <Switch
                      id="a4Discount"
                      checked={form["print.a4.showDiscount"] === "true"}
                      onCheckedChange={(checked) =>
                        updateField("print.a4.showDiscount", checked ? "true" : "false")
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-4 pt-2 border-t">
                <div className="space-y-2">
                  <Label htmlFor="marginTop">{t("settingsPage.print.marginTop")}</Label>
                  <Input
                    id="marginTop"
                    type="number"
                    value={form["print.a4.marginTop"]}
                    onChange={(e) => updateField("print.a4.marginTop", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="marginBottom">{t("settingsPage.print.marginBottom")}</Label>
                  <Input
                    id="marginBottom"
                    type="number"
                    value={form["print.a4.marginBottom"]}
                    onChange={(e) => updateField("print.a4.marginBottom", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="marginLeft">{t("settingsPage.print.marginLeft")}</Label>
                  <Input
                    id="marginLeft"
                    type="number"
                    value={form["print.a4.marginLeft"]}
                    onChange={(e) => updateField("print.a4.marginLeft", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="marginRight">{t("settingsPage.print.marginRight")}</Label>
                  <Input
                    id="marginRight"
                    type="number"
                    value={form["print.a4.marginRight"]}
                    onChange={(e) => updateField("print.a4.marginRight", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t">
                <Label htmlFor="a4Footer">{t("settingsPage.print.footerText")}</Label>
                <Textarea
                  id="a4Footer"
                  value={form["print.a4.footerText"]}
                  onChange={(e) => updateField("print.a4.footerText", e.target.value)}
                  placeholder={t("settingsPage.print.footerPlaceholder")}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ReceiptText className="h-4 w-4" />
                {t("settingsPage.print.thermalTitle")}
              </CardTitle>
              <CardDescription>{t("settingsPage.print.thermalDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="thermalPaper">{t("settingsPage.print.paperWidth")}</Label>
                  <Select
                    value={form["print.thermal.paperWidth"]}
                    onValueChange={(v) => updateField("print.thermal.paperWidth", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("settingsPage.print.selectPaperWidth")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58">{t("settingsPage.print.paper58")}</SelectItem>
                      <SelectItem value="80">{t("settingsPage.print.paper80")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="thermalAuto">{t("settingsPage.print.autoPrint")}</Label>
                    <Switch
                      id="thermalAuto"
                      checked={form["print.thermal.autoPrint"] === "true"}
                      onCheckedChange={(checked) =>
                        updateField("print.thermal.autoPrint", checked ? "true" : "false")
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="thermalLogo">{t("settingsPage.print.showLogoReceipt")}</Label>
                    <Switch
                      id="thermalLogo"
                      checked={form["print.thermal.showLogo"] === "true"}
                      onCheckedChange={(checked) =>
                        updateField("print.thermal.showLogo", checked ? "true" : "false")
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="thermalQr">{t("settingsPage.print.includeQr")}</Label>
                    <Switch
                      id="thermalQr"
                      checked={form["print.thermal.includeQr"] === "true"}
                      onCheckedChange={(checked) =>
                        updateField("print.thermal.includeQr", checked ? "true" : "false")
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="thermalFooter">{t("settingsPage.print.thermalFooter")}</Label>
                  <Input
                    id="thermalFooter"
                    value={form["print.thermal.footerMessage"]}
                    onChange={(e) => updateField("print.thermal.footerMessage", e.target.value)}
                    placeholder={t("settingsPage.print.footerPlaceholder")}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("settingsPage.print.usbTitle")}</CardTitle>
              <CardDescription>
                {t("settingsPage.print.usbDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PrinterSetup />
            </CardContent>
          </Card>
        </div>

        {/* Live Preview Panel */}
        <div className="space-y-4 lg:col-span-6">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  {t("settingsPage.print.livePreview")}
                </CardTitle>
                <CardDescription>
                  {t("settingsPage.print.livePreviewDescription")}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={previewTab === "a4" ? "default" : "outline"}
                  onClick={() => setPreviewTab("a4")}
                >
                  <FileText className="me-1 h-3.5 w-3.5" />
                  {t("settingsPage.print.previewA4")}
                </Button>
                <Button
                  size="sm"
                  variant={previewTab === "thermal" ? "default" : "outline"}
                  onClick={() => setPreviewTab("thermal")}
                >
                  <ReceiptText className="me-1 h-3.5 w-3.5" />
                  {t("settingsPage.print.previewThermal")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-4 bg-muted/30 overflow-auto max-h-[850px] flex justify-center items-start">
              {previewTab === "a4" ? (
                <div className="w-full max-w-[560px] bg-white rounded-sm shadow-lg border p-4 text-black text-xs scale-[0.9] origin-top">
                  <A4Invoice
                    sale={SAMPLE_SALE}
                    company={sampleCompany}
                    options={{
                      showLogo: form["print.a4.showLogo"] === "true",
                      showSku: form["print.a4.showSku"] === "true",
                      showBarcode: form["print.a4.showBarcode"] === "true",
                      showTax: form["print.a4.showTax"] === "true",
                      showDiscount: form["print.a4.showDiscount"] === "true",
                      marginTop: form["print.a4.marginTop"],
                      marginBottom: form["print.a4.marginBottom"],
                      marginLeft: form["print.a4.marginLeft"],
                      marginRight: form["print.a4.marginRight"],
                      footerText: form["print.a4.footerText"],
                    }}
                  />
                </div>
              ) : (
                /* Thermal Receipt Simulation */
                <div
                  className={`bg-white text-black p-4 shadow-md border rounded font-mono text-xs ${
                    form["print.thermal.paperWidth"] === "58" ? "w-[260px]" : "w-[340px]"
                  }`}
                >
                  <div className="text-center space-y-1 mb-3">
                    <p className="font-bold text-sm tracking-wide">AWIK NET</p>
                    <p className="text-[10px] text-gray-600">{t("settingsPage.print.sampleTagline")}</p>
                    <p className="text-[10px] text-gray-600">{t("settingsPage.print.receiptTel")}</p>
                    <p className="text-[10px] text-gray-600">{t("settingsPage.print.receiptAddress")}</p>
                  </div>

                  <div className="border-t border-b border-dashed border-gray-400 py-1.5 my-2 space-y-0.5 text-[11px]">
                    <div className="flex justify-between">
                      <span>{t("settingsPage.print.receiptLabel")}</span>
                      <span className="font-semibold">{SAMPLE_SALE.saleNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t("settingsPage.print.dateLabel")}</span>
                      <span>{new Date().toLocaleDateString("en-GB")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t("settingsPage.print.cashierLabel")}</span>
                      <span>{t("settingsPage.print.cashierName")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t("settingsPage.print.customerLabel")}</span>
                      <span>{t("settingsPage.print.customerName")}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-[11px]">
                    {SAMPLE_SALE.items.map((item, idx) => (
                      <div key={idx} className="space-y-0.5">
                        <div className="font-medium">{item.product?.name}</div>
                        <div className="flex justify-between text-gray-700">
                          <span>
                            {item.quantity} x ${Number(item.unitPrice).toFixed(2)}
                          </span>
                          <span className="font-semibold">
                            ${Number(item.totalPrice).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-dashed border-gray-400 pt-2 mt-2 space-y-1 text-[11px]">
                    <div className="flex justify-between font-bold text-sm">
                      <span>{t("settingsPage.print.totalLabel")}</span>
                      <span>${Number(SAMPLE_SALE.totalAmount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>{t("settingsPage.print.paidLabel", { method: SAMPLE_SALE.paymentMethod })}</span>
                      <span>${Number(SAMPLE_SALE.totalAmount).toFixed(2)}</span>
                    </div>
                  </div>

                  {form["print.thermal.includeQr"] === "true" && (
                    <div className="my-3 flex flex-col items-center">
                      <div className="w-16 h-16 border-2 border-black flex items-center justify-center font-bold text-[9px] bg-gray-50">
                        {t("settingsPage.print.qrCodePlaceholder")}
                      </div>
                      <span className="text-[9px] text-gray-500 mt-1">{t("settingsPage.print.scanToVerify")}</span>
                    </div>
                  )}

                  <div className="text-center text-[10px] text-gray-600 mt-3 pt-2 border-t border-dashed border-gray-400">
                    <p>{form["print.thermal.footerMessage"] || t("settingsPage.print.footerPlaceholder")}</p>
                    <p className="text-[9px] text-gray-500 mt-1">{t("settingsPage.print.poweredBy")}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
