"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingCart,
  ReceiptText,
  Package,
  DollarSign,
  AlertTriangle,
  Layers,
  ArrowRight,
  MessageCircle,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useLocalization } from "@/hooks/use-localization";
import { useSales } from "@/hooks/api/use-sales";
import { useInventorySummary, useProducts } from "@/hooks/api/use-products";
import { api } from "@/lib/api";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency, getRelativeTime } from "@/lib/utils";
import { SubscribersMapCard } from "@/components/dashboard/subscribers-map";

export default function DashboardPage() {
  const { t } = useLocalization();
  const { data: salesRes, isLoading: salesLoading } = useSales({ page: 1, limit: 50 });
  const { data: summary, isLoading: summaryLoading } = useInventorySummary();
  const { data: lowStockRes } = useProducts({ limit: 5, lowStock: "true" });
  const { data: profit, isLoading: profitLoading } = useQuery({
    queryKey: ["reports", "profit"],
    queryFn: () =>
      api.get<{
        summary: {
          revenue: number;
          cogs: number;
          grossProfit: number;
          expenses: number;
          netProfit: number;
          netMargin: number;
        };
      }>("/reports/profit"),
  });

  const profitSummary = profit?.summary;
  const netPositive = (profitSummary?.netProfit ?? 0) >= 0;

  const sales = salesRes?.data || [];
  const completed = sales.filter((s) => s.status === "COMPLETED");
  const totalRevenue = completed.reduce((sum, s) => {
    const amount = Number(s.totalAmount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = sales.filter((s) => {
    const createdAt = s.createdAt ? new Date(s.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
    return createdAt.toISOString().slice(0, 10) === today;
  }).length;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-primary p-6 text-primary-foreground sm:p-8">
        <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-24 -start-10 h-72 w-72 rounded-full bg-white/10" />
        <div className="relative max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t("dashboardPage.heroTitle")}
          </h1>
          <p className="mt-2 text-sm text-primary-foreground/80 sm:text-base">
            {t("dashboardPage.heroSubtitle")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-background text-foreground hover:bg-background/90">
              <Link href="/sales/pos">
                <ShoppingCart className="me-2 h-5 w-5" />
                {t("dashboardPage.openPos")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-primary-foreground hover:bg-white/10 hover:text-primary-foreground">
              <Link href="/sales">
                <ReceiptText className="me-2 h-5 w-5" />
                {t("nav.salesHistory")}
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {salesLoading || summaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="mb-2 h-4 w-24" />
                <Skeleton className="mb-2 h-8 w-16" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              title={t("dashboardPage.totalRevenue")}
              value={formatCurrency(totalRevenue)}
              icon={DollarSign}
              description={t("dashboardPage.completedSales")}
            />
            <StatCard
              title={t("dashboardPage.salesToday")}
              value={todayCount}
              icon={ReceiptText}
              description={t("dashboardPage.acrossPaymentMethods")}
            />
            <StatCard
              title={t("dashboardPage.productsInStock")}
              value={summary?.totalStock ?? 0}
              icon={Layers}
              description={t("dashboardPage.productsCount", { count: summary?.totalProducts ?? 0 })}
            />
            <StatCard
              title={t("dashboardPage.lowStock")}
              value={summary?.lowStock ?? 0}
              icon={AlertTriangle}
              description={t("dashboardPage.outOfStockCount", { count: summary?.outOfStock ?? 0 })}
            />
          </>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("dashboardPage.profitTitle")}</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/reports/profit" className="flex items-center gap-1">
              {t("dashboardPage.viewReport")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {profitLoading ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("dashboardPage.grossProfitLabel")}</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatCurrency(profitSummary?.grossProfit ?? 0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <Wallet className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("dashboardPage.expensesLabel")}</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatCurrency(profitSummary?.expenses ?? 0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <TrendingUp className={`h-5 w-5 ${netPositive ? "text-success" : "text-destructive"}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{t("dashboardPage.netProfit")}</p>
                  <p
                    className={`text-lg font-semibold tabular-nums ${
                      netPositive ? "text-success" : "text-destructive"
                    }`}
                  >
                    {formatCurrency(profitSummary?.netProfit ?? 0)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("dashboardPage.recentSales")}</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/sales" className="flex items-center gap-1">
                {t("dashboardPage.viewAll")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {salesLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : sales.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("dashboardPage.noSales")}
              </p>
            ) : (
              <ul className="divide-y">
                {sales.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/sales/detail?id=${encodeURIComponent(s.id)}`}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-colors hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {s.saleNumber}
                          {s.customer ? ` · ${s.customer.firstName} ${s.customer.lastName}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">{getRelativeTime(s.createdAt)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge status={s.status} />
                        <span className="text-sm font-semibold tabular-nums">
                          {formatCurrency(Number(s.totalAmount), s.currency)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("dashboardPage.lowStockAlerts")}</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/inventory" className="flex items-center gap-1">
                {t("dashboardPage.manage")} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {lowStockRes?.data?.length ? (
              <ul className="divide-y">
                {lowStockRes.data.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 px-2 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("dashboardPage.sku")} {p.sku} · {p.category?.name ?? "—"}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {p.currentStock} {p.unit}
                    </p>
                  </li>
                ))}
              </ul>
            ) : lowStockRes?.data?.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("dashboardPage.inventoryHealthy")}
              </p>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("dashboardPage.noProductsInStock")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <SubscribersMapCard />

      <div>
        <h2 className="mb-4 text-lg font-semibold">{t("dashboard.quickActions")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: t("dashboardPage.startSale"), href: "/sales/pos", icon: ShoppingCart },
            { label: t("dashboardPage.viewInventory"), href: "/inventory", icon: Package },
            { label: t("dashboardPage.whatsappTemplates"), href: "/whatsapp/templates", icon: MessageCircle },
            { label: t("nav.salesHistory"), href: "/sales", icon: ReceiptText },
          ].map((action) => (
            <Button key={action.href} variant="outline" className="h-auto justify-start gap-3 p-4" asChild>
              <Link href={action.href}>
                <action.icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm">{action.label}</span>
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}