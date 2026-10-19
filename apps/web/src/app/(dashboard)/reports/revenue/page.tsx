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
import { TrendingUp, DollarSign, Receipt, Percent } from "lucide-react";

interface RevenueSummary {
  totalRevenue: number;
  totalPayments: number;
  totalCost?: number;
  grossProfit?: number;
}

interface MonthlyPoint {
  month: string;
  revenue: number;
  salesCount: number;
}

interface RevenueReport {
  summary: RevenueSummary;
  byMethod?: { method: string; total: number; count: number }[];
  monthly?: MonthlyPoint[];
  payments?: Array<{
    id: string;
    amount: number;
    receivedAt?: string;
    createdAt: string;
    invoice?: { id: string; totalAmount: number; createdAt: string } | null;
  }>;
}

function useMonthlyColumns(): ColumnDef<MonthlyPoint>[] {
  const { t } = useLocalization();

  return React.useMemo(
    () => [
      {
        accessorKey: "month",
        header: t("reportsPages.revenue.month"),
        cell: ({ row }) => <span className="font-medium">{row.original.month}</span>,
      },
      {
        accessorKey: "revenue",
        header: t("reportsPages.revenue.revenueCol"),
        cell: ({ row }) => formatCurrency(Number(row.original.revenue || 0)),
      },
      {
        accessorKey: "salesCount",
        header: t("reportsPages.revenue.salesCol"),
        cell: ({ row }) => <span className="tabular-nums">{row.original.salesCount ?? 0}</span>,
      },
      {
        id: "average",
        header: t("reportsPages.revenue.avgSaleCol"),
        cell: ({ row }) => {
          const count = row.original.salesCount || 0;
          return (
            <span className="tabular-nums">
              {formatCurrency(count > 0 ? Number(row.original.revenue || 0) / count : 0)}
            </span>
          );
        },
      },
    ],
    [t]
  );
}

export default function RevenueReportPage() {
  const { t } = useLocalization();
  const monthlyColumns = useMonthlyColumns();
  const { data: report, isLoading, error, refetch } = useQuery({
    queryKey: ["revenue-report"],
    queryFn: () => api.get<RevenueReport>("/reports/revenue"),
  });

  const monthlyData: MonthlyPoint[] = React.useMemo(() => {
    const monthly = report?.monthly;
    if (!Array.isArray(monthly)) return [];
    return [...monthly].sort((a, b) => String(a.month).localeCompare(String(b.month)));
  }, [report]);

  if (isLoading) return <LoadingState message={t("reportsPages.revenue.loading")} />;
  if (error) return <ErrorState message={(error as { message?: string })?.message || t("reportsPages.revenue.loadError")} onRetry={() => refetch()} />;
  if (!report) return <EmptyState message={t("reportsPages.revenue.noData")} />;

  const summary = report.summary ?? { totalRevenue: 0, totalPayments: 0 };
  const byMethod = Array.isArray(report.byMethod) ? report.byMethod : [];
  const grossProfit = Number(summary.grossProfit ?? 0);
  const totalCost = Number(summary.totalCost ?? 0);
  const margin = summary.totalRevenue > 0 ? (grossProfit / summary.totalRevenue) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t("reportsPages.revenue.title")} description={t("reportsPages.revenue.description")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("reportsPages.revenue.totalRevenue")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">{t("reportsPages.revenue.allTime")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("reportsPages.revenue.totalPayments")}</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalPayments}</div>
            <p className="text-xs text-muted-foreground">{t("reportsPages.revenue.completedTransactions")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("reportsPages.revenue.grossProfit")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(grossProfit)}</div>
            <p className="text-xs text-muted-foreground">
              {t("reportsPages.revenue.marginLabel", { margin: margin.toFixed(1) })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("reportsPages.revenue.costOfGoods")}</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalCost)}</div>
            <p className="text-xs text-muted-foreground">{t("reportsPages.revenue.costOfGoodsHint")}</p>
          </CardContent>
        </Card>
      </div>
      {byMethod.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reportsPages.revenue.byMethod")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {byMethod.map((m) => (
                <div key={m.method} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{String(m.method || "—").replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">{t("reportsPages.revenue.paymentsCount", { count: m.count })}</p>
                  </div>
                  <span className="font-semibold">{formatCurrency(Number(m.total || 0))}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reportsPages.revenue.monthlyBreakdown")}</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyData.length === 0 ? (
            <EmptyState message={t("reportsPages.revenue.noMonthly")} />
          ) : (
            <DataTable columns={monthlyColumns} data={monthlyData} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
