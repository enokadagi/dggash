"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useLocalization } from "@/hooks/use-localization";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { openWhatsAppWeb, buildExpiryReminderText, buildSaleReceiptText } from "@/lib/whatsapp-link";
import {
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Send,
  PlugZap,
  Save,
  Copy,
  Clock,
  ShieldCheck,
  Eye,
  EyeOff,
  BellRing,
  ExternalLink,
  Smartphone,
  Sparkles,
  ArrowRight,
} from "lucide-react";

interface WhatsAppStatusResponse {
  configured: boolean;
  phoneNumberId: string;
  hasToken: boolean;
  businessAccountId: string;
  webhookVerifyToken: string;
  reminders: {
    enabled5d: boolean;
    enabled3d: boolean;
    enabled1d: boolean;
    enabledExpiry: boolean;
    offset5d: string;
    offset3d: string;
    offset1d: string;
  };
}

interface DueReminders {
  count: number;
  reminders: { customerName: string; phone: string; type: string; planName: string | null }[];
}

export default function WhatsAppConnectPage() {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = React.useState<"free" | "api">("free");

  // Free Direct WhatsApp State
  const [directPhone, setDirectPhone] = React.useState("");
  const [directName, setDirectName] = React.useState("");
  const [directPlan, setDirectPlan] = React.useState("Standard 10 Mbps");
  const [directPrice, setDirectPrice] = React.useState("15.00");
  const [directMessage, setDirectMessage] = React.useState(
    "Hello! This is AWIK NET Internet Service Provider. We are reaching out regarding your internet subscription."
  );

  // Meta Cloud API State
  const [phoneNumberId, setPhoneNumberId] = React.useState("");
  const [accessToken, setAccessToken] = React.useState("");
  const [businessAccountId, setBusinessAccountId] = React.useState("");
  const [webhookVerifyToken, setWebhookVerifyToken] = React.useState("awiknet-webhook-secret");
  const [showToken, setShowToken] = React.useState(false);

  // Reminders state
  const [enabled5d, setEnabled5d] = React.useState(true);
  const [enabled3d, setEnabled3d] = React.useState(true);
  const [enabled1d, setEnabled1d] = React.useState(true);
  const [enabledExpiry, setEnabledExpiry] = React.useState(true);
  const [offset5d, setOffset5d] = React.useState("5");
  const [offset3d, setOffset3d] = React.useState("3");
  const [offset1d, setOffset1d] = React.useState("1");

  // Meta test send state
  const [testRecipient, setTestRecipient] = React.useState("");
  const [testMessage, setTestMessage] = React.useState(
    "Hello! This is a test message from AWIK NET ISP Management System. Your WhatsApp integration is working perfectly!"
  );
  const [isSendingTest, setIsSendingTest] = React.useState(false);
  const [isTestingConn, setIsTestingConn] = React.useState(false);
  const [isTriggeringDue, setIsTriggeringDue] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const { data: statusData, isLoading, refetch } = useQuery<WhatsAppStatusResponse>({
    queryKey: ["whatsapp-status-connect"],
    queryFn: () => api.get<WhatsAppStatusResponse>("/whatsapp/status"),
  });

  const { data: dueData } = useQuery<DueReminders>({
    queryKey: ["whatsapp-reminders", "due"],
    queryFn: () => api.get<DueReminders>("/whatsapp/reminders/due"),
  });

  React.useEffect(() => {
    if (statusData) {
      if (statusData.phoneNumberId) setPhoneNumberId(statusData.phoneNumberId);
      if (statusData.businessAccountId) setBusinessAccountId(statusData.businessAccountId);
      if (statusData.webhookVerifyToken) setWebhookVerifyToken(statusData.webhookVerifyToken);
      if (statusData.reminders) {
        setEnabled5d(statusData.reminders.enabled5d);
        setEnabled3d(statusData.reminders.enabled3d);
        setEnabled1d(statusData.reminders.enabled1d);
        setEnabledExpiry(statusData.reminders.enabledExpiry);
        setOffset5d(statusData.reminders.offset5d || "5");
        setOffset3d(statusData.reminders.offset3d || "3");
        setOffset1d(statusData.reminders.offset1d || "1");
      }
    }
  }, [statusData]);

  const handleApplyTemplate = (type: "5d" | "3d" | "1d" | "expiry" | "receipt" | "renewed") => {
    const customer = directName.trim() || "Customer";
    const dateFormatted = new Date().toLocaleDateString("en-GB");

    switch (type) {
      case "5d":
        setDirectMessage(
          buildExpiryReminderText({
            customerName: customer,
            planName: directPlan,
            daysRemaining: 5,
            expiryDate: dateFormatted,
            price: directPrice,
          })
        );
        break;
      case "3d":
        setDirectMessage(
          buildExpiryReminderText({
            customerName: customer,
            planName: directPlan,
            daysRemaining: 3,
            expiryDate: dateFormatted,
            price: directPrice,
          })
        );
        break;
      case "1d":
        setDirectMessage(
          buildExpiryReminderText({
            customerName: customer,
            planName: directPlan,
            daysRemaining: 1,
            expiryDate: dateFormatted,
            price: directPrice,
          })
        );
        break;
      case "expiry":
        setDirectMessage(
          buildExpiryReminderText({
            customerName: customer,
            planName: directPlan,
            daysRemaining: 0,
            expiryDate: dateFormatted,
            price: directPrice,
          })
        );
        break;
      case "receipt":
        setDirectMessage(
          buildSaleReceiptText({
            customerName: customer,
            saleNumber: `S-${Date.now().toString().slice(-6)}`,
            totalAmount: directPrice,
            itemsCount: 1,
          })
        );
        break;
      case "renewed":
        setDirectMessage(
          `Hello ${customer},\n\nYour AWIK NET internet subscription (${directPlan}) has been renewed successfully until ${dateFormatted}.\n\nThank you for choosing AWIK NET!`
        );
        break;
    }
      toast.success(t("whatsappPages.messageTemplateLoaded"));
  };

  const handleOpenDirectWhatsApp = () => {
    if (!directPhone.trim()) {
      toast.error(t("whatsappPages.enterCustomerPhone"));
      return;
    }
    openWhatsAppWeb(directPhone.trim(), directMessage);
    toast.success(t("whatsappPages.openingWhatsappPrefilled"));
  };

  const handleSaveCredentials = async () => {
    setIsSaving(true);
    try {
      const updates: Array<{ key: string; value: string }> = [
        { key: "whatsapp.phoneNumberId", value: phoneNumberId.trim() },
        { key: "whatsapp.businessAccountId", value: businessAccountId.trim() },
        { key: "whatsapp.webhookVerifyToken", value: webhookVerifyToken.trim() },
        { key: "reminder.enabled_5d", value: String(enabled5d) },
        { key: "reminder.enabled_3d", value: String(enabled3d) },
        { key: "reminder.enabled_1d", value: String(enabled1d) },
        { key: "reminder.enabled_expiry", value: String(enabledExpiry) },
        { key: "reminder.offset_5d", value: offset5d },
        { key: "reminder.offset_3d", value: offset3d },
        { key: "reminder.offset_1d", value: offset1d },
      ];

      if (accessToken.trim()) {
        updates.push({ key: "whatsapp.accessToken", value: accessToken.trim() });
      }

      for (const item of updates) {
        await api.patch(`/settings/${item.key}`, { value: item.value });
      }

      toast.success(t("whatsappPages.whatsappConfigSaved"));
      await refetch();
    } catch (err: any) {
      toast.error(err.message || t("whatsappPages.whatsappConfigSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConn(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>("/whatsapp/test-connection", {});
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message || "WhatsApp connection test failed");
      }
    } catch (err: any) {
      toast.error(err.message || t("whatsappPages.connectionTestFailed"));
    } finally {
      setIsTestingConn(false);
    }
  };

  const handleSendTestMessage = async () => {
    if (!testRecipient.trim()) {
      toast.error(t("whatsappPages.enterRecipientPhone"));
      return;
    }
    setIsSendingTest(true);
    try {
      await api.post("/whatsapp/send", {
        recipientPhone: testRecipient.trim(),
        messageBody: testMessage,
      });
      toast.success(`${t("whatsappPages.testMessageSentTo")} ${testRecipient}`);
    } catch (err: any) {
      toast.error(err.message || t("whatsappPages.failedToSendMessage"));
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleTriggerDueReminders = async () => {
    setIsTriggeringDue(true);
    try {
      const res = await api.post<{ processed: number }>("/whatsapp/reminders/trigger", {});
      toast.success(`${t("whatsappPages.expiryCheckComplete")}: ${res.processed} ${t("whatsappPages.notificationsProcessed")}`);
    } catch (err: any) {
      toast.error(err.message || t("whatsappPages.failedToTriggerReminders"));
    } finally {
      setIsTriggeringDue(false);
    }
  };

  const webhookCallbackUrl =
    typeof window !== "undefined"
      ? `${window.location.origin.replace(":3000", ":3001")}/api/v1/whatsapp/webhook`
      : "https://your-domain.com/api/v1/whatsapp/webhook";

  const isConnected = !!(statusData?.configured);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("whatsappPages.whatsappIntegration")}
        description={t("whatsappPages.whatsappIntegrationDesc")}
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="free" className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-green-600" />
            <span className="font-semibold">{t("whatsappPages.directWhatsappFree")}</span>
            <Badge variant="secondary" className="bg-green-100 text-green-800 text-[10px] ms-1">
              {t("whatsappPages.activeFree")}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="api" className="flex items-center gap-2">
            <PlugZap className="h-4 w-4" />
            <span>{t("whatsappPages.metaCloudApi")}</span>
            {isConnected ? (
              <Badge className="bg-green-600 text-[10px] text-white ms-1">{t("common.connected")}</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] ms-1">{t("common.optional")}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: 100% Free Direct WhatsApp ─────────────────────── */}
        <TabsContent value="free" className="space-y-6">
          <Card className="border-green-200 bg-green-50/40">
            <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white">
                  <MessageCircle className="h-6 w-6" />
                </div>
                <div>
                   <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                     {t("whatsappPages.directWhatsappMessagingMode")}
                     <Badge className="bg-green-600 text-white">{t("whatsappPages.zeroCostNoCard")}</Badge>
                   </h3>
                   <p className="text-sm text-muted-foreground mt-0.5">
                     {t("whatsappPages.directWhatsappMessagingDesc")}
                   </p>
                </div>
              </div>

              <Button asChild className="bg-green-600 hover:bg-green-700 text-white shrink-0">
                <Link href="/whatsapp/reminders">
                  <BellRing className="me-2 h-4 w-4" />
                  {t("whatsappPages.viewDueExpiryReminders")} ({dueData?.count || 0})
                </Link>
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-12">
            {/* Quick Free Messenger */}
            <Card className="lg:col-span-7">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-green-600" />
                   {t("whatsappPages.quickDirectWhatsappSender")}
                 </CardTitle>
                 <CardDescription>
                   {t("whatsappPages.quickDirectWhatsappSenderDesc")}
                 </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                     <Label htmlFor="custPhone">{t("whatsappPages.customerPhoneWithCode")}</Label>
                    <Input
                      id="custPhone"
                      placeholder="+961 70 123 456"
                      value={directPhone}
                      onChange={(e) => setDirectPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                     <Label htmlFor="custName">{t("whatsappPages.customerNameOptional")}</Label>
                    <Input
                      id="custName"
                      placeholder="e.g. Ahmad Hassan"
                      value={directName}
                      onChange={(e) => setDirectName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                   <Label className="text-xs text-muted-foreground">{t("whatsappPages.quickTemplates")}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => handleApplyTemplate("5d")}
                    >
                       {t("whatsappPages.fiveDayExpiryNotice")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => handleApplyTemplate("3d")}
                    >
                       {t("whatsappPages.threeDayExpiryNotice")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 text-amber-700 border-amber-200"
                      onClick={() => handleApplyTemplate("1d")}
                    >
                       {t("whatsappPages.oneDayUrgent")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 text-red-700 border-red-200"
                      onClick={() => handleApplyTemplate("expiry")}
                    >
                       {t("whatsappPages.expiredToday")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => handleApplyTemplate("renewed")}
                    >
                       {t("whatsappPages.planRenewed")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => handleApplyTemplate("receipt")}
                    >
                       {t("whatsappPages.saleReceipt")}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                   <Label htmlFor="directMsg">{t("whatsappPages.messagePreviewEditable")}</Label>
                     <Textarea
                       id="directMsg"
                       rows={5}
                       value={directMessage}
                       onChange={(e) => setDirectMessage(e.target.value)}
                     />
                </div>

                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleOpenDirectWhatsApp}
                >
                  <MessageCircle className="me-2 h-4 w-4" />
                  {t("whatsappPages.openInWhatsappWebAppSendFree")}
                </Button>
              </CardContent>
            </Card>

            {/* How Free WhatsApp Works & Due Reminders Shortcut */}
            <div className="space-y-6 lg:col-span-5">
              <Card>
                <CardHeader>
                   <CardTitle className="text-base flex items-center gap-2">
                     <CheckCircle2 className="h-4 w-4 text-green-600" />
                     {t("whatsappPages.howFreeWhatsappWorks")}
                   </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs text-muted-foreground">
                  <div className="flex gap-2">
                    <span className="font-bold text-foreground">1.</span>
                     <span>
                       <strong>{t("whatsappPages.noApiKeySubscription")}</strong> {t("whatsappPages.noApiKeySubscriptionDesc")}
                     </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-bold text-foreground">2.</span>
                    <span>
                       <strong>{t("whatsappPages.fromPcOrMobile")}</strong> {t("whatsappPages.fromPcOrMobileDesc")}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-bold text-foreground">3.</span>
                    <span>
                       <strong>{t("whatsappPages.integratedEverywhere")}</strong> {t("whatsappPages.integratedEverywhereDesc")}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-bold text-foreground">4.</span>
                    <span>
                       <strong>{t("whatsappPages.noRiskOfBans")}</strong> {t("whatsappPages.noRiskOfBansDesc")}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Expiring Customers Quick Box */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                     <span>{t("whatsappPages.dueExpiryReminders")}</span>
                     <Badge variant="outline">{dueData?.count || 0} {t("whatsappPages.due")}</Badge>
                   </CardTitle>
                   <CardDescription>
                     {t("whatsappPages.subscriptionsDueToday")}
                   </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dueData?.count ? (
                    <div className="space-y-2">
                      {dueData.reminders.slice(0, 3).map((r, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded border bg-muted/30 text-xs">
                          <div>
                            <p className="font-medium">{r.customerName}</p>
                            <p className="text-muted-foreground">{r.phone}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-green-200 text-green-700"
                            onClick={() => {
                              const text = buildExpiryReminderText({
                                customerName: r.customerName,
                                planName: r.planName,
                                daysRemaining: 1,
                                expiryDate: new Date().toLocaleDateString("en-GB"),
                              });
                              openWhatsAppWeb(r.phone, text);
                            }}
                          >
                            <MessageCircle className="h-3 w-3 me-1 text-green-600" />
                            Send
                          </Button>
                        </div>
                      ))}
                      <Button asChild variant="link" className="text-xs p-0 w-full text-center">
                        <Link href="/whatsapp/reminders">
                          Go to Expiry Reminders Table <ArrowRight className="ms-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No subscribers are currently expiring today.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── TAB 2: Official Meta Cloud API ────────────────────────── */}
        <TabsContent value="api" className="space-y-6">
          <Card className={isConnected ? "border-green-200 bg-green-50/50" : "border-yellow-200 bg-yellow-50/40"}>
            <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                    isConnected ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  <PlugZap className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">
                       {t("whatsappPages.metaCloudApiBackgroundScheduler")}
                     </h3>
                     {isConnected ? (
                       <Badge className="bg-green-600 text-white">
                         <CheckCircle2 className="me-1 h-3 w-3" />
                         {t("whatsappPages.connectedAutomated")}
                       </Badge>
                     ) : (
                       <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                         <AlertCircle className="me-1 h-3 w-3" />
                         {t("whatsappPages.notConfigured")}
                       </Badge>
                     )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                     {t("whatsappPages.metaCloudApiDesc")}
                   </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={isTestingConn}
                >
                   {isTestingConn && <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />}
                   {t("whatsappPages.testConnection")}
                </Button>
                <Button size="sm" onClick={handleSaveCredentials} disabled={isSaving}>
                   {isSaving ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="me-1.5 h-3.5 w-3.5" />}
                   {t("whatsappPages.saveApiConfig")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-7">
              <Card>
                <CardHeader>
                   <CardTitle className="text-base flex items-center gap-2">
                     <ShieldCheck className="h-4 w-4" />
                     {t("whatsappPages.apiCredentialsMetaCloud")}
                   </CardTitle>
                  <CardDescription>
                    Configure these when you are ready to use Meta&apos;s automated background worker
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phoneId">WhatsApp Phone Number ID</Label>
                    <Input
                      id="phoneId"
                      placeholder="e.g. 106294829104820"
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Found in Meta App Dashboard &gt; WhatsApp &gt; API Setup &gt; Phone number ID.
                    </p>
                  </div>

                  <div className="space-y-2">
                     <Label htmlFor="token">{t("whatsappPages.permanentAccessToken")}</Label>
                    <div className="relative">
                      <Input
                        id="token"
                        type={showToken ? "text" : "password"}
                        placeholder={
                          statusData?.hasToken
                            ? "•••••••••••••••••••••••••••••••• (Stored securely)"
                            : "e.g. EAAG... (System User Token)"
                        }
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="absolute end-1 top-1/2 -translate-y-1/2"
                        onClick={() => setShowToken(!showToken)}
                      >
                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                     <Label htmlFor="wabaId">{t("whatsappPages.whatsappBusinessAccountId")}</Label>
                    <Input
                      id="wabaId"
                      placeholder="e.g. 109283749102834"
                      value={businessAccountId}
                      onChange={(e) => setBusinessAccountId(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2 pt-2 border-t">
                     <Label htmlFor="verifyToken">{t("whatsappPages.webhookVerificationToken")}</Label>
                    <Input
                      id="verifyToken"
                      value={webhookVerifyToken}
                      onChange={(e) => setWebhookVerifyToken(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Automated Background Reminders Rules */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                       {t("whatsappPages.automaticBackgroundScan")}
                     </CardTitle>
                     <CardDescription>
                       {t("whatsappPages.automaticBackgroundScanDesc")}
                     </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTriggerDueReminders}
                    disabled={isTriggeringDue || !isConnected}
                  >
                    {isTriggeringDue ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" /> : <Clock className="me-1.5 h-3.5 w-3.5" />}
                     {t("whatsappPages.scanNow")}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3 pt-2">
                  <div className="rounded-lg border divide-y">
                    <div className="flex items-center justify-between p-3">
                      <Label htmlFor="rem5" className="font-medium cursor-pointer">
                         {t("whatsappPages.fiveDaysBeforeExpiry")}
                      </Label>
                      <Switch id="rem5" checked={enabled5d} onCheckedChange={setEnabled5d} />
                    </div>
                    <div className="flex items-center justify-between p-3">
                      <Label htmlFor="rem3" className="font-medium cursor-pointer">
                         {t("whatsappPages.threeDaysBeforeExpiry")}
                      </Label>
                      <Switch id="rem3" checked={enabled3d} onCheckedChange={setEnabled3d} />
                    </div>
                    <div className="flex items-center justify-between p-3">
                      <Label htmlFor="rem1" className="font-medium cursor-pointer">
                         {t("whatsappPages.oneDayBeforeExpiryTomorrow")}
                      </Label>
                      <Switch id="rem1" checked={enabled1d} onCheckedChange={setEnabled1d} />
                    </div>
                    <div className="flex items-center justify-between p-3">
                      <Label htmlFor="remExp" className="font-medium cursor-pointer">
                        On                          {t("whatsappPages.expiryDayToday")}
                      </Label>
                      <Switch id="remExp" checked={enabledExpiry} onCheckedChange={setEnabledExpiry} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6 lg:col-span-5">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <PlugZap className="h-4 w-4" />
                    Webhook Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Callback URL</Label>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={webhookCallbackUrl} className="font-mono text-xs bg-muted" />
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(webhookCallbackUrl);
                          toast.success("Webhook URL copied");
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Verify Token</Label>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={webhookVerifyToken} className="font-mono text-xs bg-muted" />
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(webhookVerifyToken);
                          toast.success("Verify token copied");
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Test Live Message */}
              <Card>
                <CardHeader>
                   <CardTitle className="text-base flex items-center gap-2">
                     <Send className="h-4 w-4" />
                     {t("whatsappPages.testMetaApiDelivery")}
                   </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                     <Label htmlFor="testPhone">{t("whatsappPages.phoneNumber")}</Label>
                    <Input
                      id="testPhone"
                      placeholder="+961 70 123 456"
                      value={testRecipient}
                      onChange={(e) => setTestRecipient(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                     <Label htmlFor="testMsg">{t("whatsappPages.messageBody")}</Label>
                    <Textarea
                      id="testMsg"
                      rows={3}
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleSendTestMessage}
                    disabled={isSendingTest || !isConnected}
                  >
                    {isSendingTest ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Send className="me-2 h-4 w-4" />}
                     {t("whatsappPages.sendViaMetaCloudApi")}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
