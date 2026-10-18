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

function useCategoryColumns(): ColumnDef<CategoryRow>[] {
  const { t } = useLocalization();

  return React.useMemo(
    () => [
      {
        accessorKey: "category",
        header: t("reportsPages.inventory.category"),
        cell: ({ row }) => <span className="font-medium">{row.original.category}</span>,
      },
      {
        accessorKey: "count",
        header: t("reportsPages.inventory.total"),
        cell: ({ row }) => formatNumber(row.original.count),
      },
      {
        accessorKey: "inUse",
        header: t("reportsPages.inventory.inUse"),
        cell: () => <span className="text-muted-foreground">{t("reportsPages.inventory.na")}</span>,
      },
      {
        accessorKey: "available",
        header: t("reportsPages.inventory.available"),
        cell: () => <span className="text-muted-foreground">{t("reportsPages.inventory.na")}</span>,
      },
      {
        accessorKey: "estimatedValue",
        header: t("reportsPages.inventory.value"),
        cell: ({ row }) => formatCurrency(row.original.estimatedValue),
      },
    ],
    [t]
  );
}

export default function InventoryReportPage() {
  const { t } = useLocalization();
  const categoryColumns = useCategoryColumns();
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

  if (isLoading) return <LoadingState message={t("reportsPages.inventory.loading")} />;
  if (error) return <ErrorState message={(error as { message?: string })?.message || t("reportsPages.inventory.loadError")} onRetry={() => { refetchReport(); refetchAssetStats(); }} />;
  if (!report) return <EmptyState message={t("reportsPages.inventory.noData")} />;

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
      <PageHeader title={t("reportsPages.inventory.title")} description={t("reportsPages.inventoryDesc")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("reportsPages.inventory.totalItems")}</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(report.summary.totalItems)}</div>
            <p className="text-xs text-muted-foreground">{t("reportsPages.inventory.uniqueItems")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("reportsPages.inventory.totalQuantity")}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(report.summary.totalQuantity)}</div>
            <p className="text-xs text-muted-foreground">{t("reportsPages.inventory.unitsInStock")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("reportsPages.inventory.totalValue")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(report.summary.totalValue)}</div>
            <p className="text-xs text-muted-foreground">{t("reportsPages.inventory.valuation")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("reportsPages.inventory.lowStockItems")}</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatNumber(lowStockCount)}</div>
            <p className="text-xs text-muted-foreground">{t("reportsPages.inventory.itemsBelowMin")}</p>
          </CardContent>
        </Card>
      </div>
      {assetStats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("reportsPages.inventory.assetsInUse")}</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatNumber(assetStats.inUse)}</div>
              <p className="text-xs text-muted-foreground">{t("reportsPages.inventory.activeAssignments")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("reportsPages.inventory.availableAssets")}</CardTitle>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(assetStats.available)}</div>
              <p className="text-xs text-muted-foreground">{t("reportsPages.inventory.readyForAssignment")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("reportsPages.inventory.depreciatedValue")}</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(assetStats.depreciatedValue)}</div>
              <p className="text-xs text-muted-foreground">{t("reportsPages.inventory.totalDepreciation")}</p>
            </CardContent>
          </Card>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reportsPages.inventory.categoryBreakdown")}</CardTitle>
        </CardHeader>
        <CardContent>
          {categoryRows.length === 0 ? (
            <EmptyState message={t("reportsPages.inventory.noCategories")} />
          ) : (
            <DataTable columns={categoryColumns} data={categoryRows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
