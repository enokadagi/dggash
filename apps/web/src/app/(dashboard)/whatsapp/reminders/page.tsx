"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing, Send } from "lucide-react";
import { api } from "@/lib/api";
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

interface DueReminders {
  count: number;
  reminders: { customerName: string; phone: string; type: string; planName: string | null }[];
}

const TYPE_LABEL: Record<string, string> = {
  DAYS_5: "5 days before expiry",
  DAYS_3: "3 days before expiry",
  DAYS_1: "1 day before expiry",
  EXPIRY_DAY: "Expiry day",
};

export default function ExpiryNotificationsPage() {
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
      toast.success("Due reminders sent");
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to send reminders");
    },
  });

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
            <span className="text-xs text-muted-foreground">
              {customer?.phone}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "plan",
      header: "Plan",
      cell: ({ row }) => (
        <span>{row.original.subscription?.plan?.name || "—"}</span>
      ),
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
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expiry Notifications"
        description="Customers who receive a WhatsApp message when their plan is about to expire"
        actions={
          <Button
            onClick={() => sendDueMutation.mutate()}
            disabled={sendDueMutation.isPending || !due?.count}
          >
            <Send className="me-2 h-4 w-4" />
            Send Due Today
          </Button>
        }
      />

      <Card>
        <CardContent className="flex items-start gap-3 border-b p-4">
          <BellRing className="mt-0.5 h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {due?.count ? `${due.count} reminder${due.count === 1 ? "" : "s"} due today` : "No reminders due today"}
            </p>
            {due?.count ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {due.reminders
                  .map((r) => `${r.customerName} (${r.planName || "no plan"})`)
                  .join(", ")}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Customers will be notified automatically as their plan nears expiry.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium">Reminder history</p>
              <p className="text-xs text-muted-foreground">
                {data?.total ?? 0} reminders{isLoading ? "..." : ""}
              </p>
            </div>
            <div className="w-full sm:w-48">
              <Label htmlFor="status-filter" className="mb-1 block text-xs font-medium text-muted-foreground">
                Status
              </Label>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger id="status-filter" className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error.message} onRetry={() => refetch()} />
          ) : reminders.length === 0 ? (
            <EmptyState message="No reminders found with the current filters" />
          ) : (
            <DataTable
              columns={columns}
              data={reminders}
              page={page}
              totalPages={totalPages}
              totalItems={data?.total}
              onPageChange={setPage}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}