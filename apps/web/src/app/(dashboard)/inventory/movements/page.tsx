"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { usePagination } from "@/hooks/use-pagination";
import { useDebounce } from "@/hooks/use-debounce";
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
      header: "Product",
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
      header: "Type",
      cell: ({ row }) => <MovementBadge type={row.original.movementType} />,
    },
    {
      accessorKey: "quantity",
      header: "Change",
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
      header: "Stock",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {row.original.previousStock} → {row.original.newStock}
        </span>
      ),
    },
    {
      accessorKey: "reference",
      header: "Reference",
      cell: ({ row }) => row.original.reference || "—",
    },
    {
      accessorKey: "user.firstName",
      header: "By",
      cell: ({ row }) => {
        const u = row.original.user;
        return u ? `${u.firstName} ${u.lastName ?? ""}`.trim() : "—";
      },
    },
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Movements"
        description="Every purchase, sale, adjustment, and correction to product stock levels"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Movements" value={data?.total || 0} icon={ArrowRightLeft} />
        <StatCard title="Stock Additions" value={inboundCount} icon={TrendingUp} />
        <StatCard title="Stock Reductions" value={outboundCount} icon={TrendingDown} />
        <StatCard title="Corrections" value={correctionCount} icon={RotateCw} />
      </div>
      {isLoading ? (
        <LoadingState message="Loading movements..." />
      ) : error ? (
        <ErrorState message="Failed to load movements. Try again." onRetry={() => refetch()} />
      ) : movements.length === 0 ? (
        <EmptyState message="No movements yet. Movements are recorded automatically when products are stocked, sold, adjusted, or corrected." />
      ) : (
        <DataTable
          columns={columns}
          data={movements}
          searchPlaceholder="Search movements..."
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