"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { usePagination } from "@/hooks/use-pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { useLocalization } from "@/hooks/use-localization";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/status-states";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate } from "@/lib/utils";
import { ArrowRightLeft, TrendingUp, TrendingDown, RotateCw } from "lucide-react";

interface StockMovement {
  id: string;
  movementType: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reference?: string | null;
  notes?: string | null;
  createdAt: string;
  product?: { id: string; name: string; sku: string };
  user?: { id: string; firstName: string; lastName: string };
}

const INBOUND_TYPES = new Set(["PURCHASE", "RETURN"]);
const OUTBOUND_TYPES = new Set(["SALE", "DAMAGED", "LOST"]);

function MovementBadge({ type }: { type: string }) {
  if (INBOUND_TYPES.has(type)) {
    return <Badge variant="success">{type}</Badge>;
  }
  if (OUTBOUND_TYPES.has(type)) {
    return <Badge variant="destructive">{type}</Badge>;
  }
  if (type === "ADJUSTMENT" || type === "CORRECTION") {
    return <Badge variant="warning">{type}</Badge>;
  }
  return <Badge variant="secondary">{type}</Badge>;
}

export default function InventoryMovementsPage() {
  const { t } = useLocalization();
  const { page, limit, setPage } = usePagination();
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["stock-movements", page, limit, debouncedSearch],
    queryFn: () =>
      api.get<{ data: StockMovement[]; total: number; page: number; limit: number }>("/inventory/movements", {
        page,
        limit,
        search: debouncedSearch || undefined,
      }),
  });

  const movements = data?.data || [];

  const inboundCount = movements.filter((m) => m.newStock - m.previousStock > 0).length;
  const outboundCount = movements.filter((m) => m.newStock - m.previousStock < 0).length;
  const correctionCount = movements.filter((m) => m.movementType === "CORRECTION").length;

  const columns: ColumnDef<StockMovement>[] = [
    {
      accessorKey: "product.name",
      header: t("inventoryPage.movements.product"),
      cell: ({ row }) => (
        <div>
          <span className="font-medium">{row.original.product?.name || "—"}</span>
          {row.original.product?.sku && (
            <span className="block font-mono text-xs text-muted-foreground">{row.original.product.sku}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "movementType",
      header: t("inventoryPage.movements.type"),
      cell: ({ row }) => <MovementBadge type={row.original.movementType} />,
    },
    {
      accessorKey: "quantity",
      header: t("inventoryPage.movements.change"),
      cell: ({ row }) => {
        const delta = row.original.newStock - row.original.previousStock;
        return (
          <span className={`font-medium tabular-nums ${delta < 0 ? "text-destructive" : "text-green-600"}`}>
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        );
      },
    },
    {
      accessorKey: "previousStock",
      header: t("inventoryPage.movements.stock"),
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {row.original.previousStock} → {row.original.newStock}
        </span>
      ),
    },
    {
      accessorKey: "reference",
      header: t("inventoryPage.movements.reference"),
      cell: ({ row }) => row.original.reference || "—",
    },
    {
      accessorKey: "user.firstName",
      header: t("inventoryPage.movements.by"),
      cell: ({ row }) => {
        const u = row.original.user;
        return u ? `${u.firstName} ${u.lastName ?? ""}`.trim() : "—";
      },
    },
    {
      accessorKey: "createdAt",
      header: t("inventoryPage.movements.date"),
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("inventoryPage.movements.title")}
        description={t("inventoryPage.movements.description")}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("inventoryPage.movements.totalMovements")} value={data?.total || 0} icon={ArrowRightLeft} />
        <StatCard title={t("inventoryPage.movements.stockAdditions")} value={inboundCount} icon={TrendingUp} />
        <StatCard title={t("inventoryPage.movements.stockReductions")} value={outboundCount} icon={TrendingDown} />
        <StatCard title={t("inventoryPage.movements.corrections")} value={correctionCount} icon={RotateCw} />
      </div>
      {isLoading ? (
        <LoadingState message={t("inventoryPage.movements.loading")} />
      ) : error ? (
        <ErrorState message={t("inventoryPage.movements.loadError")} onRetry={() => refetch()} />
      ) : movements.length === 0 ? (
        <EmptyState message={t("inventoryPage.movements.empty")} />
      ) : (
        <DataTable
          columns={columns}
          data={movements}
          searchPlaceholder={t("inventoryPage.movements.search")}
          onSearch={setSearch}
          page={page}
          totalPages={data ? Math.ceil(data.total / (data.limit || 1)) : 1}
          totalItems={data?.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}