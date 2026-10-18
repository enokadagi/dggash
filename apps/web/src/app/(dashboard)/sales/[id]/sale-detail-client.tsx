"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSale, useRefundSale, useCancelSale } from "@/hooks/api/use-sales";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/status-states";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoicePrintButton } from "@/components/invoice/invoice-print-button";
import { ReceiptPrintButton } from "@/components/printer/receipt-print-button";
import { useLocalization } from "@/hooks/use-localization";
import { ArrowLeft, RotateCcw, XCircle, User, CreditCard, FileText, MessageCircle } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { openWhatsAppWeb, buildSaleReceiptText } from "@/lib/whatsapp-link";

export function SaleDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { t } = useLocalization();
  const { data: sale, isLoading, isError } = useSale(id);
  const refundMutation = useRefundSale();
  const cancelMutation = useCancelSale();
  const [confirm, setConfirm] = React.useState<null | "refund" | "cancel">(null);

  if (isLoading) return <LoadingState message={t("salesPages.loadingSale")} />;

  if (isError || !sale) {
    return (
      <div className="space-y-4">
        <ErrorState message={t("salesPages.saleNotFound")} />
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href="/sales">
              <ArrowLeft className="me-2 h-4 w-4" />
              {t("salesPages.backToSales")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const customer = sale.customer;
  const itemCount = sale.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={sale.saleNumber}
        description={t("salesPages.completedAt", { date: formatDateTime(sale.createdAt) })}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/sales">
                <ArrowLeft className="me-2 h-4 w-4" />
                {t("salesPages.back")}
              </Link>
            </Button>
            <InvoicePrintButton sale={sale as any} />
            <ReceiptPrintButton sale={sale as any} cashierName={sale.user ? `${sale.user.firstName} ${sale.user.lastName}` : undefined} />
            <Button
              variant="outline"
              className="border-green-200 text-green-700 hover:bg-green-50"
              onClick={() => {
                const text = buildSaleReceiptText({
                  customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : null,
                  saleNumber: sale.saleNumber,
                  totalAmount: sale.totalAmount,
                  currency: sale.currency,
                  itemsCount: sale.items.length,
                });
                openWhatsAppWeb(customer?.phone || "", text);
              }}
            >
              <MessageCircle className="me-2 h-4 w-4 text-green-600" />
              {t("salesPages.whatsappReceipt")}
            </Button>
            <Button asChild variant="outline">
              <Link href={`/sales/invoice?id=${encodeURIComponent(sale.id)}`}>
                <FileText className="me-2 h-4 w-4" />
                {t("salesPages.previewInvoice")}
              </Link>
            </Button>
            {sale.status === "COMPLETED" && (
              <>
                <Button variant="outline" onClick={() => setConfirm("refund")}>
                  <RotateCcw className="me-2 h-4 w-4" />
                  {t("salesPages.refund")}
                </Button>
                <Button variant="destructive" onClick={() => setConfirm("cancel")}>
                  <XCircle className="me-2 h-4 w-4" />
                  {t("common.cancel")}
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4" />
              {t("salesPages.payment")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("salesPages.status")}</span>
              <StatusBadge status={sale.status} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("salesPages.method")}</span>
              <span className="capitalize">{sale.paymentMethod.replace(/_/g, " ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("salesPages.total")}</span>
              <span className="text-lg font-bold">
                {formatCurrency(Number(sale.totalAmount), sale.currency)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              {t("salesPages.customer")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {customer ? (
              <>
                <p className="font-medium">
                  {customer.firstName} {customer.lastName}
                </p>
                <p className="text-muted-foreground">{customer.phone}</p>
              </>
            ) : (
              <p className="text-muted-foreground">{t("salesPages.walkIn")}</p>
            )}
            {sale.user && (
              <p className="pt-2 text-xs text-muted-foreground">
                {t("salesPages.soldBy", { name: `${sale.user.firstName} ${sale.user.lastName}` })}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("salesPages.summary")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("salesPages.lineItems")}</span>
              <span>{sale.items.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("salesPages.unitsSold")}</span>
              <span>{itemCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("salesPages.currency")}</span>
              <span>{sale.currency}</span>
            </div>
            {sale.notes && (
              <p className="pt-2 text-xs text-muted-foreground">
                {t("salesPages.note", { note: sale.notes })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("salesPages.lineItemsTable")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("salesPages.product")}</TableHead>
                <TableHead className="text-end">{t("salesPages.sku")}</TableHead>
                <TableHead className="text-end">{t("salesPages.unitPrice")}</TableHead>
                <TableHead className="text-end">{t("salesPages.qty")}</TableHead>
                <TableHead className="text-end">{t("salesPages.total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sale.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.product?.name || item.productId}</TableCell>
                  <TableCell className="text-end font-mono text-sm text-muted-foreground">
                    {item.product?.sku || "—"}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {formatCurrency(Number(item.unitPrice), sale.currency)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{item.quantity}</TableCell>
                  <TableCell className="text-end font-medium tabular-nums">
                    {formatCurrency(Number(item.totalPrice), sale.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="text-end font-semibold">
                  {t("salesPages.grandTotal")}
                </TableCell>
                <TableCell className="text-end font-bold tabular-nums">
                  {formatCurrency(Number(sale.totalAmount), sale.currency)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm === "cancel" ? t("salesPages.confirm.cancelTitle") : t("salesPages.confirm.refundTitle")}
        description={t("salesPages.confirm.restoreStock", {
          sale: sale.saleNumber,
          amount: formatCurrency(Number(sale.totalAmount), sale.currency),
          status: confirm === "cancel" ? t("sales.cancelled") : t("sales.refunded"),
        })}
        confirmLabel={confirm === "cancel" ? t("salesPages.confirm.cancelSale") : t("salesPages.confirm.refundSale")}
        onConfirm={() => {
          if (confirm === "cancel") cancelMutation.mutate({ id: sale.id });
          else refundMutation.mutate({ id: sale.id });
          setConfirm(null);
          router.refresh();
        }}
        destructive={confirm === "cancel"}
      />
    </div>
  );
}