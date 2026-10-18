"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing, Send, MessageCircle, ExternalLink, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { useLocalization } from "@/hooks/use-localization";
import { usePagination } from "@/hooks/use-pagination";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/status-states";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { openWhatsAppWeb, buildExpiryReminderText } from "@/lib/whatsapp-link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ExpiryReminder {
  id: string;
  subscriptionId: string;
  customerId: string;
  reminderType: string;
  scheduledFor: string;
  sentAt: string | null;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
  subscription?: {
    expiryDate: string;
    plan?: { id: string; name: string };
    customer?: { id: string; firstName: string; lastName: string; phone: string };
  };
}

interface RemindersResponse {
  data: ExpiryReminder[];
  total: number;
  page: number;
  limit: number;
}

interface DueReminderItem {
  customerName: string;
  phone: string;
  type: string;
  planName: string | null;
  expiryDate?: string;
}

interface DueReminders {
  count: number;
  reminders: DueReminderItem[];
}

const TYPE_LABEL: Record<string, string> = {
  DAYS_5: "5 days before expiry",
  DAYS_3: "3 days before expiry",
  DAYS_1: "1 day before expiry",
  EXPIRY_DAY: "Expiry day",
};

export default function ExpiryNotificationsPage() {
  const { t } = useLocalization();
  const { page, limit, setPage } = usePagination();
  const [status, setStatus] = React.useState("all");
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["whatsapp-reminders", page, limit, status],
    queryFn: () =>
      api.get<RemindersResponse>("/whatsapp/reminders", {
        page,
        limit,
        status: status === "all" ? undefined : status,
      }),
  });

  const { data: due } = useQuery({
    queryKey: ["whatsapp-reminders", "due"],
    queryFn: () => api.get<DueReminders>("/whatsapp/reminders/due"),
  });

  const sendDueMutation = useMutation({
    mutationFn: () => api.post("/whatsapp/reminders/trigger"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-reminders"] });
      toast.success(t("whatsappPages.dueRemindersProcessed"));
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || t("whatsappPages.failedToTriggerAutomaticReminders"));
    },
  });

  const handleOpenWhatsAppDue = (item: DueReminderItem) => {
    const daysRemaining =
      item.type === "EXPIRY_DAY" ? 0 : item.type === "DAYS_1" ? 1 : item.type === "DAYS_3" ? 3 : 5;
    const expiryFormatted = item.expiryDate
      ? new Date(item.expiryDate).toLocaleDateString("en-GB")
      : "soon";

    const text = buildExpiryReminderText({
      customerName: item.customerName,
      planName: item.planName,
      daysRemaining,
      expiryDate: expiryFormatted,
    });

    openWhatsAppWeb(item.phone, text);
    toast.success(`${t("whatsappPages.openingWhatsappFor")} ${item.customerName}...`);
  };

  const reminders = data?.data || [];
  const totalPages = data ? Math.ceil(data.total / (data.limit || 1)) : 1;

  const columns: ColumnDef<ExpiryReminder>[] = [
    {
      accessorKey: "customer",
      header: "Customer",
      cell: ({ row }) => {
        const customer = row.original.subscription?.customer;
        return (
          <div className="flex flex-col">
            <span className="font-medium">
              {customer ? `${customer.firstName} ${customer.lastName}` : "—"}
            </span>
            <span className="text-xs text-muted-foreground">{customer?.phone}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "plan",
      header: "Plan",
      cell: ({ row }) => <span>{row.original.subscription?.plan?.name || "—"}</span>,
    },
    {
      accessorKey: "reminderType",
      header: "Reminder",
      cell: ({ row }) => TYPE_LABEL[row.original.reminderType] || row.original.reminderType,
    },
    {
      accessorKey: "scheduledFor",
      header: "Scheduled For",
      cell: ({ row }) => (
        <span className="text-sm">{formatDateTime(row.original.scheduledFor)}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "sentAt",
      header: "Sent At",
      cell: ({ row }) =>
        row.original.sentAt ? (
          <span className="text-sm text-muted-foreground">{formatDateTime(row.original.sentAt)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: t("whatsappPages.directWhatsappFree"),
      cell: ({ row }) => {
        const customer = row.original.subscription?.customer;
        const plan = row.original.subscription?.plan;
        const expiryDate = row.original.subscription?.expiryDate
          ? new Date(row.original.subscription.expiryDate).toLocaleDateString("en-GB")
          : "";
        if (!customer?.phone) return null;

        const daysRemaining =
          row.original.reminderType === "EXPIRY_DAY"
            ? 0
            : row.original.reminderType === "DAYS_1"
            ? 1
            : row.original.reminderType === "DAYS_3"
            ? 3
            : 5;

        const text = buildExpiryReminderText({
          customerName: `${customer.firstName} ${customer.lastName}`.trim(),
          planName: plan?.name,
          daysRemaining,
          expiryDate,
        });

        return (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs text-green-700 hover:text-green-800 hover:bg-green-50 border-green-200"
            onClick={() => {
              openWhatsAppWeb(customer.phone, text);
               toast.success(`${t("whatsappPages.openingWhatsappFor")} ${customer.firstName}...`);
             }}
           >
             <MessageCircle className="h-3.5 w-3.5 text-green-600" />
             {t("whatsappPages.sendInWhatsapp")}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("whatsappPages.expiryNotifications")}
        description={t("whatsappPages.expiryNotificationsDesc")}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-1.5 border-green-200 text-green-700 hover:bg-green-50"
              onClick={() => {
                if (due?.reminders?.length) {
                  due.reminders.forEach((r, idx) => {
                    setTimeout(() => handleOpenWhatsAppDue(r), idx * 600);
                  });
                } else {
                  toast.info(t("whatsappPages.noDueRemindersRightNow"));
                }
              }}
              disabled={!due?.count}
            >
              <MessageCircle className="h-4 w-4 text-green-600" />
              {t("whatsappPages.openAllDueInWhatsappFree")}
            </Button>
            <Button
              onClick={() => sendDueMutation.mutate()}
              disabled={sendDueMutation.isPending || !due?.count}
            >
              <Send className="me-2 h-4 w-4" />
              {t("whatsappPages.autoSendViaApi")}
            </Button>
          </div>
        }
      />

      {/* Due reminders summary & one-click quick actions */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BellRing className="h-5 w-5" />
            </div>
            <div className="flex-1">
               <p className="text-base font-semibold">
                 {due?.count
                   ? `${due.count} ${due.count === 1 ? t("whatsappPages.customerReminder") : t("whatsappPages.customerReminders")} ${t("whatsappPages.dueToday")}`
                   : t("whatsappPages.noRemindersDueToday")}
               </p>
               <p className="text-xs text-muted-foreground">
                 {due?.count
                   ? t("whatsappPages.clickSendInWhatsappBelow")
                   : t("whatsappPages.customersWillAppearWhen")}
               </p>
            </div>
          </div>

          {due?.count ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-2 border-t">
              {due.reminders.map((r, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg border p-2.5 bg-muted/20"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-semibold truncate">{r.customerName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {r.planName || "Plan"} · {r.phone}
                    </p>
                    <span className="inline-block text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded mt-0.5">
                      {TYPE_LABEL[r.type] || r.type}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 text-xs shrink-0 text-green-700 hover:text-green-800 hover:bg-green-50 border-green-200"
                    onClick={() => handleOpenWhatsAppDue(r)}
                  >
                    <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                    Send (Free)
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium">Reminder history</p>
              <p className="text-xs text-muted-foreground">
                {data?.total ?? 0} reminders recorded
              </p>
            </div>
            <div className="w-full sm:w-48">
              <Label
                htmlFor="status-filter"
                className="mb-1 block text-xs font-medium text-muted-foreground"
              >
                Status
              </Label>
              <Select value={status} onValueChange={(val) => { setStatus(val); setPage(1); }}>
                <SelectTrigger id="status-filter">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DataTable
            columns={columns}
            data={reminders}
            totalItems={data?.total ?? 0}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}