"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/status-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { api } from "@/lib/api";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Package, CheckCircle2, XCircle, DollarSign, TrendingDown } from "lucide-react";

interface InventorySummary {
  totalItems: number;
  totalQuantity: number;
  totalValue: number;
}

interface CategoryBreakdown {
  category: string;
  count: number;
  totalQuantity: number;
}

interface InventoryReport {
  summary: InventorySummary;
  byCategory: CategoryBreakdown[];
  lowStock: any[];
}

interface AssetStats {
  totalAssets: number;
  inUse: number;
  available: number;
  depreciatedValue: number;
}

interface CategoryRow {
  category: string;
  count: number;
  estimatedValue: number;
}

const categoryColumns: ColumnDef<CategoryRow>[] = [
  {
    accessorKey: "category",
    header: "Category",
    cell: ({ row }) => <span className="font-medium">{row.original.category}</span>,
  },
  {
    accessorKey: "count",
    header: "Total",
    cell: ({ row }) => formatNumber(row.original.count),
  },
  {
    accessorKey: "inUse",
    header: "In Use",
    cell: () => <span className="text-muted-foreground">N/A</span>,
  },
  {
    accessorKey: "available",
    header: "Available",
    cell: () => <span className="text-muted-foreground">N/A</span>,
  },
  {
    accessorKey: "estimatedValue",
    header: "Value",
    cell: ({ row }) => formatCurrency(row.original.estimatedValue),
  },
];

export default function InventoryReportPage() {
  const { data: report, isLoading: reportLoading, error: reportError, refetch: refetchReport } = useQuery({
    queryKey: ["inventory-report"],
    queryFn: () => api.get<InventoryReport>("/reports/inventory"),
  });

  const { data: assetStats, isLoading: assetStatsLoading, error: assetStatsError, refetch: refetchAssetStats } = useQuery({
    queryKey: ["inventory-lifecycle-stats"],
    queryFn: () => api.get<AssetStats>("/inventory-lifecycle/stats"),
  });

  const isLoading = reportLoading || assetStatsLoading;
  const error = reportError || assetStatsError;

  if (isLoading) return <LoadingState message="Loading inventory report..." />;
  if (error) return <ErrorState message={(error as { message?: string })?.message || "Failed to load inventory report"} onRetry={() => { refetchReport(); refetchAssetStats(); }} />;
  if (!report) return <EmptyState message="No inventory data available" />;

  const lowStockCount = Array.isArray(report.lowStock) ? report.lowStock.length : 0;

  const categoryRows: CategoryRow[] = report.byCategory.map((cat) => ({
    category: cat.category,
    count: cat.count,
    estimatedValue: report.summary.totalValue > 0
      ? (cat.totalQuantity / report.summary.totalQuantity) * report.summary.totalValue
      : 0,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory Report" description="Inventory status and movement reports" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(report.summary.totalItems)}</div>
            <p className="text-xs text-muted-foreground">Unique inventory items</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Quantity</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(report.summary.totalQuantity)}</div>
            <p className="text-xs text-muted-foreground">Units in stock</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(report.summary.totalValue)}</div>
            <p className="text-xs text-muted-foreground">Inventory valuation</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatNumber(lowStockCount)}</div>
            <p className="text-xs text-muted-foreground">Items below minimum</p>
          </CardContent>
        </Card>
      </div>
      {assetStats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Assets In Use</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatNumber(assetStats.inUse)}</div>
              <p className="text-xs text-muted-foreground">Active assignments</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Available Assets</CardTitle>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(assetStats.available)}</div>
              <p className="text-xs text-muted-foreground">Ready for assignment</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Depreciated Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(assetStats.depreciatedValue)}</div>
              <p className="text-xs text-muted-foreground">Total depreciation</p>
            </CardContent>
          </Card>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Category Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {categoryRows.length === 0 ? (
            <EmptyState message="No categories available" />
          ) : (
            <DataTable columns={categoryColumns} data={categoryRows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
