"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { openWhatsAppWeb, buildSaleReceiptText } from "@/lib/whatsapp-link";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/status-states";
import { A4Invoice } from "@/components/invoice/a4-invoice";
import { InvoicePrintButton } from "@/components/invoice/invoice-print-button";
import { ReceiptPrintButton } from "@/components/printer/receipt-print-button";
import { useCompanyProfile } from "@/hooks/api/use-company-settings";
import { useSale } from "@/hooks/api/use-sales";
import { useLocalization } from "@/hooks/use-localization";
import type { InvoiceSale } from "@/components/invoice/a4-invoice";

/**
 * A4 invoice preview + reprint for an existing order.
 *
 * Everything rendered here comes from the stored sale record, so reprints are
 * identical to the original document apart from the REPRINT marker.
 */
export default function SaleInvoicePage() {
  const { t } = useLocalization();
  const [id, setId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id") || "");
  }, []);

  const { data: sale, isLoading, isError } = useSale(id || "");
  const company = useCompanyProfile();

  if (id === null) return <LoadingState message={t("salesPages.loadingInvoice")} />;
  if (!id) return <ErrorState message={t("salesPages.invoiceMissingId")} />;

  if (isLoading) return <LoadingState message={t("salesPages.loadingInvoice")} />;

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

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("salesPages.invoiceNumber", { number: sale.saleNumber })}</h1>
          <p className="text-sm text-muted-foreground">
            {t("salesPages.invoiceDescription")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/sales/detail?id=${encodeURIComponent(sale.id)}`}>
              <ArrowLeft className="me-2 h-4 w-4" />
              {t("salesPages.backToSale")}
            </Link>
          </Button>
          <InvoicePrintButton sale={sale as unknown as InvoiceSale} reprint />
          <ReceiptPrintButton sale={sale as any} cashierName={sale.user ? `${sale.user.firstName} ${sale.user.lastName}` : undefined} />
          <Button
            variant="outline"
            className="border-green-200 text-green-700 hover:bg-green-50"
            onClick={() => {
              const text = buildSaleReceiptText({
                customerName: sale.customer ? `${sale.customer.firstName} ${sale.customer.lastName}`.trim() : null,
                saleNumber: sale.saleNumber,
                totalAmount: sale.totalAmount,
                currency: sale.currency,
                itemsCount: sale.items?.length || 0,
              });
              openWhatsAppWeb(sale.customer?.phone || "", text);
            }}
          >
            <MessageCircle className="me-2 h-4 w-4 text-green-600" />
            {t("salesPages.whatsappReceipt")}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <A4Invoice sale={sale as unknown as InvoiceSale} company={company.data} reprint />
      </div>
    </div>
  );
}
