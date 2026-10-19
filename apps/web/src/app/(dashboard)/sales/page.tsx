"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DateRange } from "react-day-picker";
import { useSales, useCancelSale, useRefundSale, useDeleteSale, useBulkDeleteSales, useClearSales, type Sale } from "@/hooks/api/use-sales";
import { usePagination } from "@/hooks/use-pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { useLocalization } from "@/hooks/use-localization";
import { useAuthStore } from "@/stores/auth-store";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Wallet,
  Trash2,
  Printer,
} from "lucide-react";

const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "credit", "other"] as const;

/** Extends a picked day to its last millisecond so the end date is inclusive. */
function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export default function SalesPage() {
  const router = useRouter();
  const { t } = useLocalization();
  const role = useAuthStore((state) => state.user?.role);
  const isAdmin = role === "ADMIN";
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
    dateTo: dateRange?.to ? endOfDay(dateRange.to).toISOString() : undefined,
  });

  const sales = data?.data || [];
  const total = data?.total || 0;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.limit || 20))) : 1;
  const currency = sales[0]?.currency || "USD";

  const [action, setAction] = React.useState<{ type: "cancel" | "refund"; sale: Sale } | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Sale | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const [clearOpen, setClearOpen] = React.useState(false);
  const [selectedSales, setSelectedSales] = React.useState<Sale[]>([]);

  const cancelMutation = useCancelSale();
  const refundMutation = useRefundSale();
  const deleteMutation = useDeleteSale();
  const bulkDeleteMutation = useBulkDeleteSales();
  const clearMutation = useClearSales();

  const pageRevenue = sales.reduce((sum, s) => {
    const amount = Number(s.totalAmount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  const pageProfit = sales.reduce((sum, s) => {
    const profit = Number(s.profit ?? 0);
    return sum + (Number.isFinite(profit) ? profit : 0);
  }, 0);
  const completedCount = sales.filter((s) => s.status === "COMPLETED").length;
  const margin = pageRevenue > 0 ? (pageProfit / pageRevenue) * 100 : 0;

  const handleActionConfirm = () => {
    if (!action) return;
    if (action.type === "cancel") cancelMutation.mutate({ id: action.sale.id });
    else refundMutation.mutate({ id: action.sale.id });
    setAction(null);
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ id: deleteTarget.id, restoreStock: true });
    setDeleteTarget(null);
  };

  const handleBulkDeleteConfirm = () => {
    const ids = selectedSales.map((s) => s.id);
    if (ids.length === 0) return;
    bulkDeleteMutation.mutate(
      { ids, restoreStock: true },
      { onSettled: () => setSelectedSales([]) }
    );
    setBulkDeleteOpen(false);
  };

  const handleClear = (scope: "all" | "filtered") => {
    const input =
      scope === "all"
        ? { all: true, restoreStock: true }
        : {
            restoreStock: true,
            ...(dateRange?.from ? { dateFrom: dateRange.from.toISOString() } : {}),
            ...(dateRange?.to ? { dateTo: endOfDay(dateRange.to).toISOString() } : {}),
            ...(status ? { status } : {}),
          };
    clearMutation.mutate(input, { onSettled: () => setSelectedSales([]) });
    setClearOpen(false);
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
      header: t("sales.saleNumber"),
      cell: ({ row }) => (
        <Link href={`/sales/detail?id=${encodeURIComponent(row.original.id)}`} className="font-mono text-sm font-medium text-primary hover:underline">
          {row.original.saleNumber}
        </Link>
      ),
    },
    {
      accessorKey: "customer",
      header: t("sales.customer"),
      cell: ({ row }) => {
        const c = row.original.customer;
        return c ? (
          <span>
            {[c.firstName, c.lastName].filter(Boolean).join(" ")}
            <span className="block text-xs text-muted-foreground">{c.phone}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{t("sales.walkIn")}</span>
        );
      },
    },
    {
      accessorKey: "products",
      header: t("sales.products"),
      cell: ({ row }) => {
        const items = row.original.items ?? [];
        const names = items
          .map((i) => i.product?.name)
          .filter((n): n is string => !!n);
        if (names.length === 0) {
          return (
            <span className="tabular-nums">
              {items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)} {t("sales.qty")}
            </span>
          );
        }
        const shown = names.slice(0, 2).join(", ");
        const extra = names.length - 2;
        return (
          <span className="block max-w-[220px] truncate" title={names.join(", ")}>
            {shown}
            {extra > 0 ? <span className="text-muted-foreground"> +{extra}</span> : null}
          </span>
        );
      },
    },
    {
      accessorKey: "paymentMethod",
      header: t("sales.payment"),
      cell: ({ row }) => (
        <span className="capitalize">{(row.original.paymentMethod || "—").replace(/_/g, " ")}</span>
      ),
    },
    {
      accessorKey: "totalAmount",
      header: t("sales.total"),
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {formatCurrency(Number(row.original.totalAmount), row.original.currency)}
        </span>
      ),
    },
    ...(isAdmin
      ? ([
          {
            accessorKey: "profit",
            header: t("sales.profit"),
            cell: ({ row }) => {
              const profit = Number(row.original.profit ?? 0);
              return (
                <span
                  className={
                    profit >= 0
                      ? "font-medium tabular-nums text-emerald-600"
                      : "font-medium tabular-nums text-destructive"
                  }
                >
                  {formatCurrency(profit, row.original.currency)}
                </span>
              );
            },
          },
        ] as ColumnDef<Sale>[])
      : []),
    {
      accessorKey: "status",
      header: t("sales.status"),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "createdAt",
      header: t("sales.date"),
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
        title={t("sales.history")}
        description={t("sales.title")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin ? (
              <Button variant="outline" onClick={() => setClearOpen(true)}>
                <Trash2 className="me-2 h-4 w-4" />
                {t("sales.clearSales")}
              </Button>
            ) : null}
            <Button asChild>
              <Link href="/sales/pos">
                <Plus className="me-2 h-4 w-4" />
                {t("sales.openPos")}
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("sales.totalSales")} value={total} icon={ShoppingCart} />
        <StatCard title={t("sales.pageRevenue")} value={formatCurrency(pageRevenue, currency)} icon={DollarSign} />
        <StatCard title={t("sales.completedPage")} value={completedCount} icon={ReceiptText} />
        <StatCard title={t("sales.avgOrder")} value={formatCurrency(sales.length ? pageRevenue / sales.length : 0, currency)} icon={TrendingUp} />
      </div>

      {isAdmin ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard title={t("sales.totalProfit")} value={formatCurrency(pageProfit, currency)} icon={Wallet} />
          <StatCard title={t("sales.margin")} value={`${margin.toFixed(1)}%`} icon={TrendingUp} />
          <StatCard
            title={t("sales.grossProfit")}
            value={formatCurrency(pageProfit, currency)}
            icon={DollarSign}
          />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("sales.filters")}</CardTitle>
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
                <SelectTrigger aria-label={t("sales.status")} className="h-9 w-full">
                  <SelectValue placeholder={t("sales.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("sales.allStatuses")}</SelectItem>
                  <SelectItem value="COMPLETED">{t("sales.completed")}</SelectItem>
                  <SelectItem value="REFUNDED">{t("sales.refunded")}</SelectItem>
                  <SelectItem value="CANCELLED">{t("sales.cancelled")}</SelectItem>
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
                <SelectTrigger aria-label={t("sales.payment")} className="h-9 w-full">
                  <SelectValue placeholder={t("sales.allMethods")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("sales.allMethods")}</SelectItem>
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
                placeholder={t("sales.date")}
              />
            </div>
          </div>
          {hasFilters && (
            <Button variant="ghost" onClick={resetFilters}>
              {t("sales.resetFilters")}
            </Button>
          )}
        </CardContent>
      </Card>

      {isAdmin && selectedSales.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3">
          <p className="text-sm font-medium">
            {t("sales.selectedCount", { count: selectedSales.length })}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedSales([])}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="me-2 h-4 w-4" />
              {t("sales.bulkDelete", { count: selectedSales.length })}
            </Button>
          </div>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={sales}
        enableSelection={isAdmin}
        onSelectionChange={setSelectedSales}
        searchPlaceholder={t("sales.searchPlaceholder")}
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
              label: t("sales.view"),
              onClick: () => router.push(`/sales/detail?id=${encodeURIComponent(row.id)}`),
              icon: <Eye className="h-4 w-4" />,
            },
            {
              label: t("sales.reprint"),
              onClick: () => router.push(`/sales/invoice?id=${encodeURIComponent(row.id)}`),
              icon: <Printer className="h-4 w-4" />,
            },
          ];
          if (row.status === "COMPLETED") {
            actions.push({
              label: t("sales.refundAction"),
              onClick: () => setAction({ type: "refund", sale: row }),
              icon: <RotateCcw className="h-4 w-4" />,
            });
            actions.push({
              label: t("sales.cancelAction"),
              onClick: () => setAction({ type: "cancel", sale: row }),
              icon: <XCircle className="h-4 w-4" />,
              destructive: true,
            });
          }
          if (isAdmin) {
            actions.push({
              label: t("sales.deleteAction"),
              onClick: () => setDeleteTarget(row),
              icon: <Trash2 className="h-4 w-4" />,
              destructive: true,
            });
          }
          return actions;
        }}
      />

      <ConfirmDialog
        open={!!action}
        onOpenChange={(open) => !open && setAction(null)}
        title={action?.type === "cancel" ? t("sales.cancelSale") : t("sales.refundSale")}
        description={
          action
            ? t("sales.restoreStock", {
                sale: action.sale.saleNumber,
                amount: formatCurrency(Number(action.sale.totalAmount), action.sale.currency),
                status: action.type === "cancel" ? t("sales.cancelled") : t("sales.refunded"),
              })
            : ""
        }
        confirmLabel={action?.type === "cancel" ? t("sales.confirmCancel") : t("sales.confirmRefund")}
        onConfirm={handleActionConfirm}
        destructive={action?.type === "cancel"}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("sales.deleteSale")}
        description={
          deleteTarget
            ? t("sales.deleteConfirm", {
                sale: deleteTarget.saleNumber,
                amount: formatCurrency(Number(deleteTarget.totalAmount), deleteTarget.currency),
              })
            : ""
        }
        confirmLabel={t("sales.confirmDelete")}
        onConfirm={handleDeleteConfirm}
        destructive
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={t("sales.bulkDeleteTitle", { count: selectedSales.length })}
        description={t("sales.bulkDeleteConfirm", { count: selectedSales.length })}
        confirmLabel={t("sales.confirmDelete")}
        onConfirm={handleBulkDeleteConfirm}
        destructive
      />

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("sales.clearSalesTitle")}</DialogTitle>
            <DialogDescription>{t("sales.clearSalesDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {hasFilters ? (
              <Button
                variant="destructive"
                onClick={() => handleClear("filtered")}
                disabled={clearMutation.isPending}
              >
                <Trash2 className="me-2 h-4 w-4" />
                {t("sales.clearFiltered")}
              </Button>
            ) : null}
            <Button
              variant="destructive"
              onClick={() => handleClear("all")}
              disabled={clearMutation.isPending}
            >
              <Trash2 className="me-2 h-4 w-4" />
              {clearMutation.isPending ? t("sales.deleting") : t("sales.clearAll")}
            </Button>
            <Button variant="outline" onClick={() => setClearOpen(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
