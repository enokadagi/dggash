"use client";

import * as React from "react";
import { Suspense } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useSubscriptions, useSuspendSubscription, useReactivateSubscription } from "@/hooks/api/use-subscriptions";
import { useLocalization } from "@/hooks/use-localization";
import { usePagination } from "@/hooks/use-pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/status-states";
import { formatDate, formatCurrency } from "@/lib/utils";
import { useSearchParams } from "next/navigation";

function SubscriptionsContent() {
  const { t } = useLocalization();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("status") || undefined;
  const { page, limit, setPage } = usePagination();
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search);
  const suspendMutation = useSuspendSubscription();
  const reactivateMutation = useReactivateSubscription();

  const { data, isLoading, error, refetch } = useSubscriptions({
    page,
    limit,
    search: debouncedSearch || undefined,
    status: statusFilter as "ACTIVE" | "SUSPENDED" | "EXPIRED" | "CANCELLED" | "PENDING" | undefined,
  });

  const subscriptions = data?.data || [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.limit || limit))) : 1;

  const columns: ColumnDef<typeof subscriptions[number]>[] = [
    {
      accessorKey: "customer",
      header: t("common.name"),
      cell: ({ row }) => {
        const c = row.original.customer;
        return c ? `${c.firstName} ${c.lastName}` : "—";
      },
    },
    {
      accessorKey: "plan",
      header: t("subscriptions.plan"),
      cell: ({ row }) => row.original.plan?.name || "—",
    },
    {
      accessorKey: "plan.price",
      header: t("plans.price"),
      cell: ({ row }) => row.original.plan ? formatCurrency(row.original.plan.price) : "—",
    },
    {
      accessorKey: "startDate",
      header: t("subscriptions.startDate"),
      cell: ({ row }) => formatDate(row.original.startDate),
    },
    {
      accessorKey: "expiryDate",
      header: t("subscriptions.nextBilling"),
      cell: ({ row }) => formatDate(row.original.expiryDate),
    },
    {
      accessorKey: "status",
      header: t("common.status"),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("subscriptions.title")} />
      {isLoading ? (
        <LoadingState message={t("common.loading") || "Loading subscriptions..."} />
      ) : error ? (
        <ErrorState message={t("common.error") || "Failed to load subscriptions"} onRetry={() => refetch()} />
      ) : subscriptions.length === 0 ? (
        <EmptyState message={t("subscriptions.noSubscriptions") || "No subscriptions found"} />
      ) : (
      <DataTable
        columns={columns}
        data={subscriptions}
        searchPlaceholder={`${t("common.search")}...`}
        onSearch={setSearch}
        page={page}
        totalPages={totalPages}
        totalItems={data?.total}
        onPageChange={setPage}
        actions={(row) => [
          ...(row.status === "ACTIVE"
            ? [{ label: t("subscriptions.suspend"), onClick: () => suspendMutation.mutate(row.id) }]
            : []),
          ...(row.status === "SUSPENDED"
            ? [{ label: t("subscriptions.reactivate"), onClick: () => reactivateMutation.mutate(row.id) }]
            : []),
        ]}
      />
      )}
    </div>
  );
}

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading subscriptions..." />}>
      <SubscriptionsContent />
    </Suspense>
  );
}
