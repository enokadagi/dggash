"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type PaginatedResponse } from "@/lib/api";
import { useLocalization } from "@/hooks/use-localization";
import { usePagination } from "@/hooks/use-pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";

interface WhatsAppMessage {
  id: string;
  recipientPhone: string;
  customerId?: string;
  messageBody: string;
  status: string;
  sentAt?: string;
  createdAt: string;
  customer?: { id: string; firstName: string; lastName: string; phone: string };
}

export default function WhatsAppMessagesPage() {
  const { t } = useLocalization();
  const { page, limit, setPage } = usePagination();
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search);

  const { data } = useQuery({
    queryKey: ["whatsapp-messages", page, limit, debouncedSearch],
    queryFn: () => api.get<PaginatedResponse<WhatsAppMessage> & { total: number; limit: number }>("/whatsapp/messages", { page, limit, search: debouncedSearch || undefined }),
  });

  const messages = data?.data || [];
  const totalPages = data ? Math.max(1, Math.ceil((data.total || 0) / (data.limit || limit))) : 1;

  const columns: ColumnDef<typeof messages[number]>[] = [
    {
      accessorKey: "recipientPhone",
      header: t("whatsapp.recipient"),
      cell: ({ row }) => {
        const c = row.original.customer;
        return (
          <div className="flex flex-col">
            <span className="font-medium">{c ? `${c.firstName} ${c.lastName}` : <span className="font-mono text-sm font-normal">{row.original.recipientPhone}</span>}</span>
            {c && <span className="font-mono text-xs text-muted-foreground">{row.original.recipientPhone}</span>}
          </div>
        );
      },
    },
    {
      accessorKey: "messageBody",
      header: t("whatsapp.body"),
      cell: ({ row }) => <span className="truncate max-w-[300px] block">{row.original.messageBody}</span>,
    },
    {
      accessorKey: "status",
      header: t("common.status"),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "sentAt",
      header: t("common.date"),
      cell: ({ row }) => row.original.sentAt ? formatDate(row.original.sentAt) : "—",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("whatsapp.messages")} />
      <DataTable
        columns={columns}
        data={messages}
        searchPlaceholder={`${t("common.search")}...`}
        onSearch={setSearch}
        page={page}
        totalPages={totalPages}
        totalItems={data?.total}
        onPageChange={setPage}
      />
    </div>
  );
}
