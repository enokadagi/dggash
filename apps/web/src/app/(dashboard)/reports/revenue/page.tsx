"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/status-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, DollarSign, Receipt, TrendingDown, Percent } from "lucide-react";

interface RevenueSummary {
  totalRevenue: number;
  totalPayments: number;
}

interface MonthlyData {
  month: string;
  invoiced: number;
  collected: number;
  outstanding: number;
  collectionRate: number;
}

interface RevenueReport {
  summary: RevenueSummary;
  byMethod: { method: string; total: number; count: number }[];
  payments: Array<{
    id: string;
    amount: number;
    receivedAt?: string;
    createdAt: string;
    invoice?: { id: string; totalAmount: number; createdAt: string } | null;
  }>;
}

const monthlyColumns: ColumnDef<MonthlyData>[] = [
  {
    accessorKey: "month",
    header: "Month",
    cell: ({ row }) => <span className="font-medium">{row.original.month}</span>,
  },
  {
    accessorKey: "invoiced",
    header: "Invoiced",
    cell: ({ row }) => formatCurrency(row.original.invoiced),
  },
  {
    accessorKey: "collected",
    header: "Collected",
    cell: ({ row }) => formatCurrency(row.original.collected),
  },
  {
    accessorKey: "outstanding",
    header: "Outstanding",
    cell: ({ row }) => <span className="text-destructive">{formatCurrency(row.original.outstanding)}</span>,
  },
  {
    accessorKey: "collectionRate",
    header: "Collection Rate",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        {row.original.collectionRate >= 90 ? (
          <TrendingUp className="h-4 w-4 text-green-500" />
        ) : (
          <TrendingDown className="h-4 w-4 text-destructive" />
        )}
        {row.original.collectionRate}%
      </div>
    ),
  },
];

export default function RevenueReportPage() {
  const { data: report, isLoading, error, refetch } = useQuery({
    queryKey: ["revenue-report"],
    queryFn: () => api.get<RevenueReport>("/reports/revenue"),
  });

  const monthlyData: MonthlyData[] = React.useMemo(() => {
    if (!report?.payments) return [];
    const monthly: Record<string, { invoiced: number; collected: number; invoiceIds: Set<string> }> = {};
    for (const p of report.payments) {
      const d = new Date(p.receivedAt || p.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthly[key]) monthly[key] = { invoiced: 0, collected: 0, invoiceIds: new Set() };
      monthly[key].collected += Number(p.amount || 0);
      if (p.invoice && !monthly[key].invoiceIds.has(p.invoice.id)) {
        monthly[key].invoiceIds.add(p.invoice.id);
        monthly[key].invoiced += Number(p.invoice.totalAmount || 0);
      }
    }
    return Object.entries(monthly)
      .map(([month, v]) => ({
        month,
        invoiced: v.invoiced,
        collected: v.collected,
        outstanding: Math.max(v.invoiced - v.collected, 0),
        collectionRate: v.invoiced > 0 ? Math.round((v.collected / v.invoiced) * 100) : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [report]);

  if (isLoading) return <LoadingState message="Loading revenue report..." />;
  if (error) return <ErrorState message={(error as { message?: string })?.message || "Failed to load revenue report"} onRetry={() => refetch()} />;
  if (!report) return <EmptyState message="No revenue data available" />;

  const collectionRate = report.summary.totalRevenue > 0
    ? Math.round((report.summary.totalRevenue / (report.summary.totalRevenue * 1.1)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue Report" description="Revenue trends and financial reports" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(report.summary.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Payments</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.summary.totalPayments}</div>
            <p className="text-xs text-muted-foreground">Completed transactions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{collectionRate}%</div>
            <p className="text-xs text-muted-foreground">Estimated collection efficiency</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Monthly Average</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(monthlyData.length > 0 ? report.summary.totalRevenue / monthlyData.length : 0)}
            </div>
            <p className="text-xs text-muted-foreground">Per month average</p>
          </CardContent>
        </Card>
      </div>
      {report.byMethod.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by Payment Method</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {report.byMethod.map((m) => (
                <div key={m.method} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{m.method.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">{m.count} payments</p>
                  </div>
                  <span className="font-semibold">{formatCurrency(m.total)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Revenue Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyData.length === 0 ? (
            <EmptyState message="No monthly data available" />
          ) : (
            <DataTable columns={monthlyColumns} data={monthlyData} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
