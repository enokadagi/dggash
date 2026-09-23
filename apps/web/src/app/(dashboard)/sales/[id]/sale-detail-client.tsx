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
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { ArrowLeft, RotateCcw, XCircle, User, CreditCard } from "lucide-react";

export function SaleDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { data: sale, isLoading, isError } = useSale(id);
  const refundMutation = useRefundSale();
  const cancelMutation = useCancelSale();
  const [confirm, setConfirm] = React.useState<null | "refund" | "cancel">(null);

  if (isLoading) return <LoadingState message="Loading sale..." />;

  if (isError || !sale) {
    return (
      <div className="space-y-4">
        <ErrorState message="Sale not found — it may have been removed or the link is incorrect." />
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href="/sales">
              <ArrowLeft className="me-2 h-4 w-4" />
              Back to Sales
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
        description={`Completed ${formatDateTime(sale.createdAt)}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/sales">
                <ArrowLeft className="me-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            {sale.status === "COMPLETED" && (
              <>
                <Button variant="outline" onClick={() => setConfirm("refund")}>
                  <RotateCcw className="me-2 h-4 w-4" />
                  Refund
                </Button>
                <Button variant="destructive" onClick={() => setConfirm("cancel")}>
                  <XCircle className="me-2 h-4 w-4" />
                  Cancel
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
              Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge status={sale.status} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Method</span>
              <span className="capitalize">{sale.paymentMethod.replace(/_/g, " ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
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
              Customer
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
              <p className="text-muted-foreground">Walk-in customer</p>
            )}
            {sale.user && (
              <p className="pt-2 text-xs text-muted-foreground">
                Sold by {sale.user.firstName} {sale.user.lastName}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Line items</span>
              <span>{sale.items.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Units sold</span>
              <span>{itemCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Currency</span>
              <span>{sale.currency}</span>
            </div>
            {sale.notes && (
              <p className="pt-2 text-xs text-muted-foreground">
                Note: {sale.notes}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-end">SKU</TableHead>
                <TableHead className="text-end">Unit Price</TableHead>
                <TableHead className="text-end">Qty</TableHead>
                <TableHead className="text-end">Total</TableHead>
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
                  Grand Total
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
        title={confirm === "cancel" ? "Cancel this sale?" : "Refund this sale?"}
        description={`This will restore stock for ${sale.saleNumber} (${formatCurrency(Number(sale.totalAmount), sale.currency)}) and mark it as ${confirm === "cancel" ? "CANCELLED" : "REFUNDED"}.`}
        confirmLabel={confirm === "cancel" ? "Cancel sale" : "Refund sale"}
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