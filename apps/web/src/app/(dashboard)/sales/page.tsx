"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DateRange } from "react-day-picker";
import { useSales, useCancelSale, useRefundSale, type Sale } from "@/hooks/api/use-sales";
import { usePagination } from "@/hooks/use-pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import {
  Plus,
  ReceiptText,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Eye,
  RotateCcw,
  XCircle,
} from "lucide-react";

const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "credit", "other"] as const;

export default function SalesPage() {
  const router = useRouter();
  const { page, limit, setPage } = usePagination({ initialLimit: 20 });
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<string>("");
  const [paymentMethod, setPaymentMethod] = React.useState<string>("");
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
  const debouncedSearch = useDebounce(search);

  const { data } = useSales({
    page,
    limit,
    search: debouncedSearch || undefined,
    status: status || undefined,
    paymentMethod: paymentMethod || undefined,
    dateFrom: dateRange?.from ? dateRange.from.toISOString() : undefined,
    dateTo: dateRange?.to ? dateRange.to.toISOString() : undefined,
  });

  const sales = data?.data || [];
  const total = data?.total || 0;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.limit || 20))) : 1;
  const currency = sales[0]?.currency || "USD";

  const [action, setAction] = React.useState<{ type: "cancel" | "refund"; sale: Sale } | null>(null);

  const cancelMutation = useCancelSale();
  const refundMutation = useRefundSale();

  const pageRevenue = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
  const completedCount = sales.filter((s) => s.status === "COMPLETED").length;

  const handleActionConfirm = () => {
    if (!action) return;
    if (action.type === "cancel") cancelMutation.mutate({ id: action.sale.id });
    else refundMutation.mutate({ id: action.sale.id });
    setAction(null);
  };

  const resetFilters = () => {
    setSearch("");
    setStatus("");
    setPaymentMethod("");
    setDateRange(undefined);
    setPage(1);
  };

  const hasFilters = !!(search || status || paymentMethod || dateRange);

  const columns: ColumnDef<Sale>[] = [
    {
      accessorKey: "saleNumber",
      header: "Sale #",
      cell: ({ row }) => (
        <Link href={`/sales/detail?id=${encodeURIComponent(row.original.id)}`} className="font-mono text-sm font-medium text-primary hover:underline">
          {row.original.saleNumber}
        </Link>
      ),
    },
    {
      accessorKey: "customer",
      header: "Customer",
      cell: ({ row }) => {
        const c = row.original.customer;
        return c ? (
          <span>
            {c.firstName} {c.lastName}
            <span className="block text-xs text-muted-foreground">{c.phone}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Walk-in</span>
        );
      },
    },
    {
      accessorKey: "paymentMethod",
      header: "Payment",
      cell: ({ row }) => (
        <span className="capitalize">{row.original.paymentMethod.replace(/_/g, " ")}</span>
      ),
    },
    {
      accessorKey: "items",
      header: "Qty",
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.items.reduce((sum, i) => sum + i.quantity, 0)}
        </span>
      ),
    },
    {
      accessorKey: "totalAmount",
      header: "Total",
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {formatCurrency(Number(row.original.totalAmount), row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {formatDateTime(row.original.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        description="POS checkouts and sale history for the storefront"
        actions={
          <Button asChild>
            <Link href="/sales/pos">
              <Plus className="me-2 h-4 w-4" />
              Open POS
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Sales" value={total} icon={ShoppingCart} />
        <StatCard title="Page Revenue" value={formatCurrency(pageRevenue, currency)} icon={DollarSign} />
        <StatCard title="Completed (page)" value={completedCount} icon={ReceiptText} />
        <StatCard title="Avg. Order" value={formatCurrency(sales.length ? pageRevenue / sales.length : 0, currency)} icon={TrendingUp} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="grid flex-1 gap-4 sm:grid-cols-3">
            <div>
              <Select
                value={status}
                onValueChange={(v) => {
                  setStatus(v === "ALL" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger aria-label="Status" className="h-9 w-full">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="REFUNDED">Refunded</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select
                value={paymentMethod}
                onValueChange={(v) => {
                  setPaymentMethod(v === "ALL" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger aria-label="Payment method" className="h-9 w-full">
                  <SelectValue placeholder="All payment methods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All methods</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      <span className="capitalize">{m.replace(/_/g, " ")}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <DateRangePicker
                value={dateRange}
                onChange={(r) => {
                  setDateRange(r);
                  setPage(1);
                }}
                placeholder="All dates"
              />
            </div>
          </div>
          {hasFilters && (
            <Button variant="ghost" onClick={resetFilters}>
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={sales}
        searchPlaceholder="Search sale #, customer, phone..."
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        page={page}
        totalPages={totalPages}
        totalItems={total}
        onPageChange={setPage}
        actions={(row) => {
          const actions: Array<{
            label: string;
            onClick: () => void;
            icon?: React.ReactNode;
            destructive?: boolean;
          }> = [
            {
              label: "View",
              onClick: () => router.push(`/sales/detail?id=${encodeURIComponent(row.id)}`),
              icon: <Eye className="h-4 w-4" />,
            },
          ];
          if (row.status === "COMPLETED") {
            actions.push({
              label: "Refund",
              onClick: () => setAction({ type: "refund", sale: row }),
              icon: <RotateCcw className="h-4 w-4" />,
            });
            actions.push({
              label: "Cancel",
              onClick: () => setAction({ type: "cancel", sale: row }),
              icon: <XCircle className="h-4 w-4" />,
              destructive: true,
            });
          }
          return actions;
        }}
      />

      <ConfirmDialog
        open={!!action}
        onOpenChange={(open) => !open && setAction(null)}
        title={action?.type === "cancel" ? "Cancel this sale?" : "Refund this sale?"}
        description={
          action
            ? `This will restore stock for sale ${action.sale.saleNumber} (${formatCurrency(Number(action.sale.totalAmount), action.sale.currency)}) and mark it as ${action.type === "cancel" ? "CANCELLED" : "REFUNDED"}.`
            : ""
        }
        confirmLabel={action?.type === "cancel" ? "Cancel sale" : "Refund sale"}
        onConfirm={handleActionConfirm}
        destructive={action?.type === "cancel"}
      />
    </div>
  );
}