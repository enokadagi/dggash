"use client";

import * as React from "react";
import { SaleDetailClient } from "../[id]/sale-detail-client";
import { ErrorState, LoadingState } from "@/components/ui/status-states";
import { useLocalization } from "@/hooks/use-localization";

export default function SaleDetailPage() {
  const { t } = useLocalization();
  const [id, setId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id") || "");
  }, []);

  if (id === null) return <LoadingState message={t("salesPages.loadingSale")} />;
  if (!id) return <ErrorState message={t("salesPages.saleMissingId")} />;

  return <SaleDetailClient id={id} />;
}