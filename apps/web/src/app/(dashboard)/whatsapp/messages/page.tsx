"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useLocalization } from "@/hooks/use-localization";
import { usePagination } from "@/hooks/use-pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/status-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface WhatsAppMessage {
  id: string;
  recipientPhone: string;
  customerId?: string;
  messageBody: string;
  status: string;
  templateType?: string;
  externalId?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  errorMessage?: string;
  createdAt: string;
  customer?: { id: string; firstName: string; lastName: string; phone: string };
}

interface WhatsAppMessagesResponse {
  data: WhatsAppMessage[];
  total: number;
  page: number;
  limit: number;
}

const statusVariant: Record<string, "success" | "destructive" | "secondary" | "default"> = {
  sent: "success",
  delivered: "success",
  read: "success",
  pending: "secondary",
  failed: "destructive",
  undelivered: "destructive",
};

export default function WhatsAppMessagesPage() {
  const { t } = useLocalization();
  const { page, limit, setPage } = usePagination();
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search);
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = React.useState("");
  const [recipientPhone, setRecipientPhone] = React.useState("");
  const [body, setBody] = React.useState("");

  const { data: customerData } = useQuery({
    queryKey: ["whatsapp-customers"],
    queryFn: () =>
      api.get<{ data: { id: string; firstName: string; lastName: string; whatsappNumber?: string | null; phone: string }[] }>(
        "/customers",
        { page: 1, limit: 100 }
      ),
  });
  const customers = customerData?.data || [];

  const pickCustomer = (id: string) => {
    setSelectedCustomerId(id);
    const customer = customers.find((c) => c.id === id);
    if (customer) {
      setRecipientPhone(customer.whatsappNumber || customer.phone);
    }
  };

  const handleSend = () => {
    const customer = customers.find((c) => c.id === selectedCustomerId);
    sendMutation.mutate(
      customer
        ? { recipientPhone, body, customerId: customer.id }
        : { recipientPhone, body }
    );
  };

  const sendMutation = useMutation({
    mutationFn: (payload: { recipientPhone: string; body: string; customerId?: string }) =>
      api.post("/whatsapp/send", payload),
    onSuccess: () => {
      toast.success(t("whatsappPages.messageQueuedSuccess"));
      setSelectedCustomerId("");
      setRecipientPhone("");
      setBody("");
      setComposerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages-log"] });
    },
    onError: (err: { message?: string }) => toast.error(err.message || t("whatsappPages.failedToSendMessage")),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["whatsapp-messages-log", page, limit, debouncedSearch],
    queryFn: () =>
      api.get<WhatsAppMessagesResponse>("/whatsapp/messages", {
        page,
        limit,
        search: debouncedSearch || undefined,
      }),
  });

  const messages = data?.data || [];
  const meta = data ? {
    total: data.total,
    totalPages: Math.max(1, Math.ceil(data.total / (data.limit || limit))),
  } : undefined;

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  const columns: ColumnDef<typeof messages[number]>[] = [
    {
      accessorKey: "recipientPhone",
      header: "To",
      cell: ({ row }) => {
        const c = row.original.customer;
        return (
          <div className="flex flex-col">
            <span className="font-medium">
              {c ? `${c.firstName} ${c.lastName}` : <span className="font-mono text-sm font-normal">{row.original.recipientPhone}</span>}
            </span>
            {c && <span className="font-mono text-xs text-muted-foreground">{row.original.recipientPhone}</span>}
          </div>
        );
      },
    },
    {
      id: "direction",
      header: "Direction",
      cell: ({ row }) => (
        <Badge variant={row.original.customerId ? "default" : "secondary"}>
          Out
        </Badge>
      ),
    },
    {
      accessorKey: "templateType",
      header: "Type",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.templateType ? row.original.templateType.replace(/^whatsapp\./, "").replace(/_template$/, "") : "manual"}
        </span>
      ),
    },
    {
      accessorKey: "messageBody",
      header: "Message",
      cell: ({ row }) => (
        <span className="truncate max-w-[300px] block">{row.original.messageBody}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={statusVariant[row.original.status] || "secondary"}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "sentAt",
      header: "Timestamp",
      cell: ({ row }) =>
        row.original.sentAt
          ? formatDate(row.original.sentAt)
          : formatDate(row.original.createdAt),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("whatsappPages.whatsappMessages")}
        description={t("whatsappPages.whatsappMessagesDesc")}
        actions={
          <Button onClick={() => setComposerOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t("whatsappPages.newWhatsAppMessage")}
          </Button>
        }
      />
      {messages.length === 0 ? (
        <EmptyState message="No messages found" />
      ) : (
        <DataTable
          columns={columns}
          data={messages}
          searchPlaceholder="Search messages..."
          onSearch={setSearch}
          page={page}
          totalPages={meta?.totalPages || 1}
          totalItems={meta?.total}
          onPageChange={setPage}
        />
      )}
      <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("whatsappPages.newWhatsAppMessage")}</DialogTitle>
            <DialogDescription>{t("whatsappPages.sendMessageToWhatsappNumber")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recipient-customer">{t("whatsappPages.customerOptional")}</Label>
              <Select value={selectedCustomerId} onValueChange={pickCustomer}>
                  <SelectTrigger id="recipient-customer"><SelectValue placeholder={t("whatsappPages.selectCustomer")} /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.firstName} {c.lastName} — {c.whatsappNumber || c.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipient-phone">{t("whatsappPages.recipientPhone")}</Label>
              <Input id="recipient-phone" placeholder="+96170000000" value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message-body">{t("whatsappPages.message")}</Label>
              <Textarea id="message-body" rows={5} value={body} onChange={(event) => setBody(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposerOpen(false)}>{t("common.cancel")}</Button>
            <Button disabled={sendMutation.isPending || !recipientPhone.trim() || !body.trim()} onClick={handleSend}>
              {sendMutation.isPending ? t("whatsappPages.sending") : t("whatsappPages.sendMessage")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
