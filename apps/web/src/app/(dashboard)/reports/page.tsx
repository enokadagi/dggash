"use client";

import * as React from "react";
import { useLocalization } from "@/hooks/use-localization";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Package } from "lucide-react";
import Link from "next/link";

export default function ReportsPage() {
  const { t } = useLocalization();

  const reports = [
    { title: t("reports.revenue"), href: "/reports/revenue", icon: TrendingUp, description: "View revenue trends and financial reports" },
    { title: t("reports.customers"), href: "/reports/customers", icon: Users, description: "Customer growth and analytics" },
    { title: t("reports.inventory"), href: "/reports/inventory", icon: Package, description: "Inventory status and movement reports" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("reports.title")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <Link key={report.href} href={report.href}>
            <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-primary/10 p-3">
                    <report.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{report.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{report.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
