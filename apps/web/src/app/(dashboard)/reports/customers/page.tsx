"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/status-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { api } from "@/lib/api";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Users, UserPlus, UserMinus, Activity, DollarSign } from "lucide-react";

interface CustomerSummary {
  totalCustomers: number;
}

interface StatusBreakdown {
  status: string;
  count: number;
}

interface MonthlyRecord {
  month: string;
  newCustomers: number;
  churned: number;
  active: number;
  mrr: number;
}

interface CustomersReport {
  summary: CustomerSummary;
  byStatus: StatusBreakdown[];
  recentCustomers: any[];
}

interface FinancialOverview {
  mrr: number;
  activeCustomerCount: number;
  churnedCustomerCount: number;
  revenueGrowth: number;
}

const growthColumns: ColumnDef<MonthlyRecord>[] = [
  {
    accessorKey: "month",
    header: "Month",
    cell: ({ row }) => <span className="font-medium">{row.original.month}</span>,
  },
  {
    accessorKey: "newCustomers",
    header: "New Customers",
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <UserPlus className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
        {row.original.newCustomers}
      </div>
    ),
  },
  {
    accessorKey: "churned",
    header: "Churned",
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <UserMinus className="h-4 w-4 text-destructive" />
        {row.original.churned}
      </div>
    ),
  },
  {
    accessorKey: "active",
    header: "Active",
    cell: ({ row }) => formatNumber(row.original.active),
  },
  {
    accessorKey: "mrr",
    header: "MRR",
    cell: ({ row }) => formatCurrency(row.original.mrr),
  },
];

export default function CustomersReportPage() {
  const { data: report, isLoading: reportLoading, error: reportError, refetch: refetchReport } = useQuery({
    queryKey: ["customers-report"],
    queryFn: () => api.get<CustomersReport>("/reports/customers"),
  });

  const { data: financial, isLoading: financialLoading, error: financialError, refetch: refetchFinancial } = useQuery({
    queryKey: ["financial-overview"],
    queryFn: () => api.get<FinancialOverview>("/financial/overview"),
  });

  const isLoading = reportLoading || financialLoading;
  const error = reportError || financialError;

  const monthlyData: MonthlyRecord[] = React.useMemo(() => {
    if (!report?.recentCustomers) return [];
    const monthly: Record<string, { newCustomers: number }> = {};
    for (const c of report.recentCustomers) {
      const d = new Date(c.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthly[key]) monthly[key] = { newCustomers: 0 };
      monthly[key].newCustomers++;
    }
    return Object.entries(monthly)
      .map(([month, v]) => ({
        month,
        newCustomers: v.newCustomers,
        churned: 0,
        active: report.byStatus.find((s) => s.status === "ACTIVE")?.count || 0,
        mrr: financial?.mrr || 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [report, financial]);

  if (isLoading) return <LoadingState message="Loading customer analytics..." />;
  if (error) return <ErrorState message={(error as { message?: string })?.message || "Failed to load customer report"} onRetry={() => { refetchReport(); refetchFinancial(); }} />;
  if (!report) return <EmptyState message="No customer data available" />;

  const activeCount = report.byStatus.find((s) => s.status === "ACTIVE")?.count || 0;
  const suspendedCount = report.byStatus.find((s) => s.status === "SUSPENDED")?.count || 0;
  const churnRate = financial && financial.activeCustomerCount > 0
    ? Math.round((financial.churnedCustomerCount / financial.activeCustomerCount) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Customer Analytics" description="Customer growth and analytics report" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(report.summary.totalCustomers)}</div>
            <p className="text-xs text-muted-foreground">All customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Activity className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatNumber(activeCount)}</div>
            <p className="text-xs text-muted-foreground">Active customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Suspended</CardTitle>
            <UserMinus className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatNumber(suspendedCount)}</div>
            <p className="text-xs text-muted-foreground">Suspended accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Churn Rate</CardTitle>
            <UserMinus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{churnRate}%</div>
            <p className="text-xs text-muted-foreground">30-day churn rate</p>
          </CardContent>
        </Card>
      </div>
      {financial && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Monthly Recurring Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(financial.mrr)}</div>
              <p className="text-xs text-muted-foreground">
                {financial.revenueGrowth >= 0 ? "+" : ""}{financial.revenueGrowth}% growth
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Status Breakdown</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {report.byStatus.map((s) => (
                  <Badge key={s.status} variant="outline" className="text-xs">
                    {s.status}: {s.count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer Growth Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyData.length === 0 ? (
            <EmptyState message="No growth data available yet" />
          ) : (
            <DataTable columns={growthColumns} data={monthlyData} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
