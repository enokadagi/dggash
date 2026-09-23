import { SaleDetailClient } from "./sale-detail-client";

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SaleDetailClient id={id} />;
}