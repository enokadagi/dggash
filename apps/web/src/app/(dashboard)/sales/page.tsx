"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DateRange } from "react-day-picker";
import { useSales, useCancelSale, useRefundSale, type Sale } from "@/hooks/api/use-sales";
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
} from "lucide-react";

const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "credit", "other"] as const;

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
  const pageProfit = sales.reduce((sum, s) => sum + Number(s.profit ?? 0), 0);
  const completedCount = sales.filter((s) => s.status === "COMPLETED").length;
  const margin = pageRevenue > 0 ? (pageProfit / pageRevenue) * 100 : 0;

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
        const names = row.original.items
          .map((i) => i.product?.name)
          .filter((n): n is string => !!n);
        if (names.length === 0) {
          return (
            <span className="tabular-nums">
              {row.original.items.reduce((sum, i) => sum + i.quantity, 0)} {t("sales.qty")}
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
        <span className="capitalize">{row.original.paymentMethod.replace(/_/g, " ")}</span>
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
          <Button asChild>
            <Link href="/sales/pos">
              <Plus className="me-2 h-4 w-4" />
              {t("sales.openPos")}
            </Link>
          </Button>
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

      <DataTable
        columns={columns}
        data={sales}
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
    </div>
  );
}
