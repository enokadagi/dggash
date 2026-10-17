/**
 * Builds a printable sale receipt as an ESC/POS job.
 *
 * Column counts follow the printer's printable width in font A (the default):
 * 32 characters on 58mm paper, 48 on 80mm. `receiptColumns` picks the right one
 * so the same receipt renders correctly on either width without a second
 * template.
 */

import { EscPosBuilder, formatMoney, fitColumn } from "@/lib/escpos";
import type { Sale } from "@/hooks/api/use-sales";

export type PaperWidth = 58 | 80;

export const receiptColumns = (width: PaperWidth): number => (width === 58 ? 32 : 48);

export interface CompanyDetails {
  name: string;
  tagline: string;
  phone: string;
  address: string;
}

export interface ReceiptOptions {
  paperWidth: PaperWidth;
  company: CompanyDetails;
  cashierName?: string;
  /** Prints a QR code linking back to the sale record. */
  includeQr?: boolean;
  footerMessage?: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  credit: "Credit",
  other: "Other",
};

/** ESC/POS GS ( k symbology identifiers. */
const SYMBOLOGY_CODE128 = 73;
const SYMBOLOGY_EAN13 = 67;
const SYMBOLOGY_CODE39 = 69;

function isNumeric(value: string): boolean {
  return /^\d+$/.test(value);
}

/** Picks the strongest 1D symbology that can represent the value. */
function chooseSymbology(value: string): number {
  if (isNumeric(value) && value.length === 13) return SYMBOLOGY_EAN13;
  if (isNumeric(value) && value.length === 12) return SYMBOLOGY_CODE128;
  if (isNumeric(value) && value.length === 8) return SYMBOLOGY_CODE128;
  if (/^[\x20-\x7e]+$/.test(value) && value.length <= 20) return SYMBOLOGY_CODE39;
  return SYMBOLOGY_CODE128;
}

function isPrintableAscii(value: string): boolean {
  return /^[\x20-\x7e]*$/.test(value);
}

/**
 * Assembles the full receipt.
 *
 * Long product names are truncated to fit the column rather than wrapped: a
 * wrapped name breaks the price alignment that makes a receipt scannable, and
 * thermal printers have no word-wrap, only hard line breaks.
 */
export function buildSaleReceipt(sale: Sale, options: ReceiptOptions): EscPosBuilder {
  const { paperWidth, company, cashierName, includeQr = true, footerMessage } = options;
  const cols = receiptColumns(paperWidth);

  const job = new EscPosBuilder();
  job.init();
  job.codepage();

  // Lines printed at double width occupy two paper columns per character, so
  // they must be fitted to half the printable width or they wrap onto a second
  // line and wreck the centring.
  const halfCols = Math.floor(cols / 2);

  // Header
  job.text(fitColumn(company.name, halfCols), {
    align: "center",
    bold: true,
    widthScale: paperWidth === 58 ? 2 : 2,
    heightScale: 2,
  });
  if (company.tagline) {
    job.text(fitColumn(company.tagline, cols), { align: "center" });
  }
  if (company.address) {
    job.text(fitColumn(company.address, cols), { align: "center" });
  }
  if (company.phone) {
    job.text(fitColumn(company.phone, cols), { align: "center" });
  }

  job.feed(1);
  job.rule("=", cols);

  // Meta
  job.textColumned("Receipt", sale.saleNumber, cols, { bold: true });
  const soldAt = new Date(sale.createdAt);
  job.textColumned(
    "Date",
    soldAt.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    cols,
  );
  if (cashierName) job.textColumned("Served by", fitColumn(cashierName, cols - 12), cols);
  job.textColumned("Status", sale.status, cols);
  job.rule("-", cols);

  // Line items: name on its own row, then qty x price and the line total.
  const nameWidth = cols - 12;
  for (const item of sale.items) {
    const unitPrice = Number(item.unitPrice);
    const lineTotal = Number(item.totalPrice);
    const name = item.product?.name ?? "Item";

    job.text(fitColumn(name, cols), {});
    job.textColumned(
      `  ${item.quantity} x ${formatMoney(unitPrice)}`,
      formatMoney(lineTotal),
      cols,
    );
    const sku = item.product?.sku;
    if (sku && isPrintableAscii(sku)) {
      job.text(`  ${fitColumn(sku, nameWidth)}`, { feedAfter: 0 });
    }
  }

  job.rule("-", cols);

  // Totals. `Sale` stores only a single total (the sum of its line items), so
  // the subtotal is derived rather than read from a field that does not exist.
  const subtotal = sale.items.reduce((sum, item) => sum + Number(item.totalPrice), 0);
  job.textColumned("Subtotal", formatMoney(subtotal), cols);

  job.textColumned("TOTAL", formatMoney(sale.totalAmount), halfCols, {
    bold: true,
    widthScale: 2,
    heightScale: 2,
  });
  job.feed(1);
  job.textColumned("Paid by", PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod, cols);
  job.textColumned("Currency", sale.currency, cols);
  if (sale.customer) {
    const customerName = `${sale.customer.firstName} ${sale.customer.lastName}`.trim();
    job.textColumned("Customer", fitColumn(customerName, cols - 10), cols);
  }

  if (includeQr && isPrintableAscii(sale.id)) {
    job.feed(1);
    // 26 modules at 4 dots/8 ≈ 104mm; scale to stay inside the paper width.
    const moduleSize = paperWidth === 58 ? 2 : 3;
    job.qr(sale.id.slice(0, 24), { errorCorrection: "M", moduleSize });
  }

  job.feed(1);
  job.rule("=", cols);
  job.text(fitColumn(footerMessage ?? "Thank you for your business", cols), { align: "center" });
  if (company.name) {
    job.text(fitColumn(company.name, cols), { align: "center" });
  }

  job.cut();

  return job;
}

/** A short connectivity/status test page. */
export function buildTestReceipt(options: ReceiptOptions): EscPosBuilder {
  const { paperWidth, company } = options;
  const cols = receiptColumns(paperWidth);

  const job = new EscPosBuilder();
  job.init();
  job.codepage();

  const halfCols = Math.floor(cols / 2);

  job.text(fitColumn(company.name || "AWIK NET", halfCols), {
    align: "center",
    bold: true,
    widthScale: 2,
    heightScale: 2,
  });
  job.text("Printer test", { align: "center" });
  job.feed(1);
  job.rule("=", cols);
  job.textColumned("Paper", paperWidth === 58 ? "58mm" : "80mm", cols);
  job.textColumned("Characters", `${cols} per line`, cols);
  job.feed(1);
  job.text("!\"#$%&'()*+,-./:;<=>?@", {});
  job.text("ABCDEFGHIJKLMNOPQRSTUVWXYZ", {});
  job.text("abcdefghijklmnopqrstuvwxyz", {});
  job.text("0123456789 $ 12.34", {});
  job.feed(1);
  job.text("If this is readable, the", { align: "center" });
  job.text("printer is ready to use.", { align: "center" });
  job.cut();

  return job;
}
