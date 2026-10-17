"use client";

import * as React from "react";
import styles from "./a4-invoice.module.css";
import { formatCurrency } from "@/lib/utils";
import type { CompanyProfile } from "@/hooks/api/use-company-settings";

/** Minimal product shape carried on a sale line. */
export interface InvoiceLineProduct {
  name?: string | null;
  sku?: string | null;
  barcode?: string | null;
  unit?: string | null;
}

export interface InvoiceSaleItem {
  id?: string;
  quantity: number;
  unitPrice: number | string;
  totalPrice: number | string;
  /** Optional per-line discount amount. Absent in the current schema. */
  discount?: number | string | null;
  /** Optional per-line tax/VAT amount. Absent in the current schema. */
  tax?: number | string | null;
  product?: InvoiceLineProduct | null;
}

export interface InvoiceSaleCustomer {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface InvoiceSale {
  id: string;
  saleNumber: string;
  totalAmount: number | string;
  currency: string;
  paymentMethod: string;
  status: string;
  notes?: string | null;
  createdAt: string;
  customer?: InvoiceSaleCustomer | null;
  user?: { firstName?: string | null; lastName?: string | null } | null;
  items: InvoiceSaleItem[];
}

export interface A4InvoiceLayoutOptions {
  showLogo?: boolean;
  showSku?: boolean;
  showBarcode?: boolean;
  showTax?: boolean;
  showDiscount?: boolean;
  marginTop?: number | string;
  marginBottom?: number | string;
  marginLeft?: number | string;
  marginRight?: number | string;
  footerText?: string;
}

export interface A4InvoiceProps {
  sale: InvoiceSale;
  company?: CompanyProfile | null;
  /** Overrides the document number. Defaults to the sale number. */
  documentNumber?: string;
  /** Printed so a reprinted copy is distinguishable from the original. */
  reprint?: boolean;
  /** Rendered when re-printing; hidden in print output. */
  toolbar?: React.ReactNode;
  /** Dynamic layout options configuring columns, margins, and visibility. */
  options?: A4InvoiceLayoutOptions;
}

const EMPTY_COMPANY: CompanyProfile = {
  name: "",
  tagline: "",
  phone: "",
  email: "",
  address: "",
  website: "",
  taxId: "",
  logo: "",
  currency: "USD",
};

function num(value: number | string | null | undefined): number {
  const parsed = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateParts(iso: string): { date: string; time: string } {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return { date: iso ?? "", time: "" };
  const date = parsed.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const time = parsed.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return { date, time };
}

function statusLabel(status: string): { text: string; className?: string } {
  switch ((status || "").toUpperCase()) {
    case "REFUNDED":
      return { text: "REFUNDED", className: styles.badgeRefund };
    case "CANCELLED":
      return { text: "CANCELLED", className: styles.badgeCancel };
    default:
      return { text: "PAID" };
  }
}

/**
 * Professional A4 sales invoice.
 *
 * Renders from real order data only - there are no sample customers, products
 * or totals anywhere in this component. Unpopulated company fields are left
 * blank instead of being filled with placeholder text, so a printed document
 * can never contain fabricated details.
 *
 * Print layout is handled entirely by CSS (`@page { size: A4 }` plus the module
 * styles), so it works with the browser's own print dialog in Chrome, Edge and
 * Firefox on any A4 printer. It deliberately has no dependency on WebUSB or on
 * any particular printer brand.
 */
export function A4Invoice({
  sale,
  company,
  documentNumber,
  reprint = false,
  toolbar,
  options,
}: A4InvoiceProps) {
  const profile = { ...EMPTY_COMPANY, ...(company ?? {}) };
  const currency = sale.currency || profile.currency || "USD";
  const { date, time } = formatDateParts(sale.createdAt);

  const items = Array.isArray(sale.items) ? sale.items : [];

  const showLogo = options?.showLogo ?? true;
  const showSku = options?.showSku ?? true;
  const showBarcode = options?.showBarcode ?? false;
  const showTax = options?.showTax !== undefined ? options.showTax : items.some((item) => num(item.tax) !== 0);
  const showDiscount = options?.showDiscount !== undefined ? options.showDiscount : items.some((item) => num(item.discount) !== 0);
  const footerText = options?.footerText ?? "Thank you for your business.";

  const sheetStyle: React.CSSProperties = {
    ...(options?.marginTop !== undefined ? { paddingTop: `${options.marginTop}mm` } : {}),
    ...(options?.marginBottom !== undefined ? { paddingBottom: `${options.marginBottom}mm` } : {}),
    ...(options?.marginLeft !== undefined ? { paddingLeft: `${options.marginLeft}mm` } : {}),
    ...(options?.marginRight !== undefined ? { paddingRight: `${options.marginRight}mm` } : {}),
  };

  const subtotal = items.reduce((sum, item) => sum + num(item.totalPrice), 0);
  const totalDiscount = items.reduce((sum, item) => sum + num(item.discount), 0);
  const totalTax = items.reduce((sum, item) => sum + num(item.tax), 0);
  // Trust the stored grand total; fall back to the computed sum only if absent.
  const grandTotal = num(sale.totalAmount) || subtotal - totalDiscount + totalTax;

  const totalUnits = items.reduce((sum, item) => sum + num(item.quantity), 0);
  const badge = statusLabel(sale.status);

  const cashier =
    [sale.user?.firstName, sale.user?.lastName].filter(Boolean).join(" ").trim() || null;

  const contactLines = [
    profile.address,
    [profile.phone, profile.email].filter(Boolean).join("  |  "),
    profile.website,
    profile.taxId ? `Tax/VAT ID: ${profile.taxId}` : "",
  ]
    .filter((line) => line && line.trim())
    .join("\n");

  return (
    <>
      {toolbar ? <div className="no-print mb-4">{toolbar}</div> : null}

      <article className={styles.sheet} style={sheetStyle} data-testid="a4-invoice">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.brand}>
            {showLogo && profile.logo ? (
              <img className={styles.logo} src={profile.logo} alt="" />
            ) : null}
            <div className={styles.brandText}>
              <h1 className={styles.companyName}>{profile.name || " "}</h1>
              {profile.tagline ? <p className={styles.companyTagline}>{profile.tagline}</p> : null}
              {contactLines ? <p className={styles.companyMeta}>{contactLines}</p> : null}
            </div>
          </div>

          <div className={styles.docTitle}>
            <h2 className={styles.docHeading}>INVOICE</h2>
            <p className={styles.docNumber}>No. {documentNumber || sale.saleNumber}</p>
            <p className={styles.docDates}>
              Date: {date}
              {time ? ` — Time: ${time}` : ""}
            </p>
            {reprint ? (
              <p className={styles.docDates}>
                <strong>REPRINT</strong>
              </p>
            ) : null}
          </div>
        </header>

        {/* ── Parties ────────────────────────────────────────────────── */}
        <section className={styles.parties}>
          <div className={styles.party}>
            <p className={styles.partyLabel}>Billed To</p>
            {sale.customer ? (
              <>
                <p className={styles.partyName}>
                  {[sale.customer.firstName, sale.customer.lastName].filter(Boolean).join(" ") ||
                    "Customer"}
                </p>
                {sale.customer.phone ? <p className={styles.partyLine}>{sale.customer.phone}</p> : null}
                {sale.customer.email ? <p className={styles.partyLine}>{sale.customer.email}</p> : null}
                {sale.customer.address ? (
                  <p className={styles.partyLine}>{sale.customer.address}</p>
                ) : null}
              </>
            ) : (
              <p className={styles.partyName}>Walk-in customer</p>
            )}
            <span className={styles.badge}>{badge.text}</span>
          </div>

          <div className={styles.party}>
            <p className={styles.partyLabel}>Invoice Details</p>
            <p className={styles.partyLine}>
              <strong>Invoice:</strong> {sale.saleNumber}
            </p>
            <p className={styles.partyLine}>
              <strong>Payment method:</strong>{" "}
              {String(sale.paymentMethod || "").replace(/_/g, " ")}
            </p>
            {cashier ? (
              <p className={styles.partyLine}>
                <strong>Served by:</strong> {cashier}
              </p>
            ) : null}
            <p className={styles.partyLine}>
              <strong>Items:</strong> {items.length} line{items.length === 1 ? "" : "s"} ({totalUnits}{" "}
              unit{totalUnits === 1 ? "" : "s"})
            </p>
          </div>
        </section>

        {/* ── Line items ─────────────────────────────────────────────── */}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: "8mm" }}>#</th>
                <th>Description</th>
                {showSku ? <th style={{ width: "24mm" }}>SKU</th> : null}
                {showBarcode ? <th style={{ width: "30mm" }}>Barcode</th> : null}
                <th className={styles.center} style={{ width: "12mm" }}>
                  Qty
                </th>
                <th className={styles.num} style={{ width: "22mm" }}>
                  Unit Price
                </th>
                {showDiscount ? (
                  <th className={styles.num} style={{ width: "18mm" }}>
                    Discount
                  </th>
                ) : null}
                {showTax ? (
                  <th className={styles.num} style={{ width: "18mm" }}>
                    VAT
                  </th>
                ) : null}
                <th className={styles.num} style={{ width: "24mm" }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id ?? `${item.product?.sku ?? "line"}-${index}`}>
                  <td className={styles.center}>{index + 1}</td>
                  <td>
                    <div className={styles.itemName}>
                      {item.product?.name || "Product"}
                      {item.product?.unit && item.product.unit !== "piece" ? (
                        <span className={styles.itemSub}> per {item.product.unit}</span>
                      ) : null}
                    </div>
                  </td>
                  {showSku ? <td className={styles.mono}>{item.product?.sku || "—"}</td> : null}
                  {showBarcode ? <td className={styles.mono}>{item.product?.barcode || "—"}</td> : null}
                  <td className={styles.center}>{num(item.quantity)}</td>
                  <td className={styles.num}>{formatCurrency(num(item.unitPrice), currency)}</td>
                  {showDiscount ? (
                    <td className={styles.num}>{formatCurrency(num(item.discount), currency)}</td>
                  ) : null}
                  {showTax ? (
                    <td className={styles.num}>{formatCurrency(num(item.tax), currency)}</td>
                  ) : null}
                  <td className={styles.num}>{formatCurrency(num(item.totalPrice), currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Totals, notes ─────────────────────────────────────────── */}
        <section className={styles.bottom}>
          <div className={styles.notesBlock}>
            {sale.notes ? (
              <>
                <p className={styles.notesTitle}>Notes</p>
                <p className={styles.notesText}>{sale.notes}</p>
              </>
            ) : null}

            <p className={styles.paymentLine}>
              <strong>Amount paid by {String(sale.paymentMethod || "").replace(/_/g, " ")}:</strong>{" "}
              {formatCurrency(grandTotal, currency)}
            </p>
          </div>

          <div className={styles.totals}>
            <div className={styles.totalsRow}>
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal, currency)}</span>
            </div>
            {showDiscount && totalDiscount > 0 ? (
              <div className={styles.totalsRow}>
                <span>Discount</span>
                <span>-{formatCurrency(totalDiscount, currency)}</span>
              </div>
            ) : null}
            {showTax && totalTax > 0 ? (
              <div className={styles.totalsRow}>
                <span>Tax / VAT</span>
                <span>{formatCurrency(totalTax, currency)}</span>
              </div>
            ) : null}
            <div className={styles.totalsGrand}>
              <span>Total</span>
              <span>{formatCurrency(grandTotal, currency)}</span>
            </div>
          </div>
        </section>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <footer className={styles.footer}>
          <p className={styles.footerThanks}>{footerText}</p>
          {contactLines ? <p className={styles.footerContact}>{contactLines}</p> : null}
          <div className={styles.signature}>
            <div className={styles.signatureLine}>Customer Signature</div>
            <div className={styles.signatureLine}>Authorised Signature</div>
          </div>
          <p className={styles.footerLegal}>
            {reprint ? "Reprint of a previously issued document. " : ""}
            This invoice was issued electronically and is valid without a
            physical signature.
          </p>
        </footer>
      </article>
    </>
  );
}
