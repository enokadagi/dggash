"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
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
import { toast } from "sonner";

interface WhatsAppMessage {
  id: string;
  recipientPhone: string;
  customerId?: string;
  body: string;
  status: string;
  templateId?: string;
  externalId?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  errorMessage?: string;
  createdAt: string;
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
  const { page, limit, setPage } = usePagination();
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search);
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [recipientPhone, setRecipientPhone] = React.useState("");
  const [body, setBody] = React.useState("");

  const sendMutation = useMutation({
    mutationFn: () => api.post("/whatsapp/send", { recipientPhone, body }),
    onSuccess: () => {
      toast.success("Message queued successfully");
      setRecipientPhone("");
      setBody("");
      setComposerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages-log"] });
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to send message"),
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
      header: "Contact",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.recipientPhone}</span>
      ),
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
      accessorKey: "body",
      header: "Message",
      cell: ({ row }) => (
        <span className="truncate max-w-[300px] block">{row.original.body}</span>
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
        title="WhatsApp Messages"
        description="View all sent and received WhatsApp messages"
        actions={
          <Button onClick={() => setComposerOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            New Message
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
            <DialogTitle>New WhatsApp Message</DialogTitle>
            <DialogDescription>Send a message to a WhatsApp number in international format.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recipient-phone">Recipient phone</Label>
              <Input id="recipient-phone" placeholder="+96170000000" value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message-body">Message</Label>
              <Textarea id="message-body" rows={5} value={body} onChange={(event) => setBody(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposerOpen(false)}>Cancel</Button>
            <Button disabled={sendMutation.isPending || !recipientPhone.trim() || !body.trim()} onClick={() => sendMutation.mutate()}>
              {sendMutation.isPending ? "Sending..." : "Send Message"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
