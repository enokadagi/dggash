"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/status-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { api } from "@/lib/api";
import { useLocalization } from "@/hooks/use-localization";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown, DollarSign, Wallet } from "lucide-react";

interface ProfitSummary {
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  margin: number;
  netMargin: number;
  salesCount: number;
}

interface ProfitCategory {
  category: string;
  total: number | string;
  count: number | string;
}

interface ProfitReport {
  summary: ProfitSummary;
  byCategory?: ProfitCategory[];
}

function useCategoryColumns(): ColumnDef<ProfitCategory>[] {
  const { t } = useLocalization();
  return React.useMemo(
    () => [
      {
        accessorKey: "category",
        header: t("reportsPages.profit.category"),
        cell: ({ row }) => <span className="font-medium">{row.original.category}</span>,
      },
      {
        accessorKey: "count",
        header: t("reportsPages.profit.entries"),
        cell: ({ row }) => <span className="tabular-nums">{Number(row.original.count || 0)}</span>,
      },
      {
        accessorKey: "total",
        header: t("reportsPages.profit.amount"),
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">{formatCurrency(Number(row.original.total || 0))}</span>
        ),
      },
    ],
    [t]
  );
}

export default function ProfitReportPage() {
  const { t } = useLocalization();
  const columns = useCategoryColumns();
  const { data: report, isLoading, error, refetch } = useQuery({
    queryKey: ["reports", "profit"],
    queryFn: () => api.get<ProfitReport>("/reports/profit"),
  });

  if (isLoading) return <LoadingState message={t("reportsPages.profit.loading")} />;
  if (error) {
    return (
      <ErrorState
        message={(error as { message?: string })?.message || t("reportsPages.profit.loadError")}
        onRetry={() => refetch()}
      />
    );
  }
  if (!report) return <EmptyState message={t("reportsPages.profit.noData")} />;

  const summary = report.summary ?? {
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    expenses: 0,
    netProfit: 0,
    margin: 0,
    netMargin: 0,
    salesCount: 0,
  };
  const byCategory = Array.isArray(report.byCategory) ? report.byCategory : [];
  const netPositive = summary.netProfit >= 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t("reportsPages.profit.title")} description={t("reportsPages.profit.description")} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("reportsPages.profit.revenue")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.revenue)}</div>
            <p className="text-xs text-muted-foreground">
              {t("reportsPages.profit.salesCount", { count: summary.salesCount })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("reportsPages.profit.cogs")}</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.cogs)}</div>
            <p className="text-xs text-muted-foreground">{t("reportsPages.profit.cogsHint")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("reportsPages.profit.grossProfit")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.grossProfit)}</div>
            <p className="text-xs text-muted-foreground">
              {t("reportsPages.profit.margin", { margin: Number(summary.margin || 0).toFixed(1) })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("reportsPages.profit.expenses")}</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.expenses)}</div>
            <p className="text-xs text-muted-foreground">{t("reportsPages.profit.expensesHint")}</p>
          </CardContent>
        </Card>
      </div>

      <Card className={netPositive ? "border-success/40" : "border-destructive/40"}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">{t("reportsPages.profit.netProfit")}</CardTitle>
          {netPositive ? (
            <TrendingUp className="h-5 w-5 text-success" />
          ) : (
            <TrendingDown className="h-5 w-5 text-destructive" />
          )}
        </CardHeader>
        <CardContent>
          <div
            className={`text-3xl font-bold tabular-nums ${netPositive ? "text-success" : "text-destructive"}`}
          >
            {formatCurrency(summary.netProfit)}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("reportsPages.profit.netMargin", { margin: Number(summary.netMargin || 0).toFixed(1) })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reportsPages.profit.byCategory")}</CardTitle>
        </CardHeader>
        <CardContent>
          {byCategory.length === 0 ? (
            <EmptyState message={t("reportsPages.profit.noExpenses")} />
          ) : (
            <DataTable columns={columns} data={byCategory} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
