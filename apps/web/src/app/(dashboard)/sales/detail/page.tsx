"use client";

import * as React from "react";
import { SaleDetailClient } from "../[id]/sale-detail-client";
import { ErrorState, LoadingState } from "@/components/ui/status-states";

export default function SaleDetailPage() {
  const [id, setId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id") || "");
  }, []);

  if (id === null) return <LoadingState message="Loading sale..." />;
  if (!id) return <ErrorState message="Sale link is missing an ID." />;

  return <SaleDetailClient id={id} />;
}