import type { Sale } from "@/hooks/api/use-sales";

export interface ReceiptHtmlOptions {
  paperWidth: 58 | 80;
  company: {
    name: string;
    tagline: string;
    phone: string;
    address: string;
  };
  cashierName?: string;
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

function money(v: unknown): string {
  const n = Number(v ?? 0);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function fmtDate(d: string): string {
  try {
    const t = new Date(d);
    return t.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

export function buildReceiptHtml(sale: Sale, options: ReceiptHtmlOptions): string {
  const { paperWidth, company, cashierName, includeQr = true, footerMessage } = options;
  const total = money(sale.totalAmount);
  const subtotal = money(sale.items.reduce((s, item) => s + Number(item.totalPrice ?? 0), 0));
  const widthPx = paperWidth === 58 ? 260 : 340;
  const safeQr = (sale.id || "").slice(0, 24);
  const qrLines = includeQr && safeQr
    ? [
        `<div style="margin-top:10px;text-align:center;">`,
        `<div style="display:inline-block;width:72px;height:72px;line-height:72px;font-size:9px;border:1px solid #000;">[QR]</div>`,
        `<div style="font-size:9px;margin-top:3px;">Scan to verify</div>`,
        `</div>`,
      ]
    : [];
  const items = sale.items
    .map((item) => {
      const name = item.product?.name || "Item";
      const qty = item.quantity;
      const up = money(item.unitPrice);
      const lp = money(item.totalPrice);
      const sku = item.product?.sku;
      return [
        `<div style="font-weight:600;margin-top:4px;">${escapeHtml(name).slice(0, 42)}</div>`,
        `<div style="display:flex;justify-content:space-between;font-size:11px;">`,
        `<span>${qty} x ${up}</span>`,
        `<span>${lp}</span>`,
        `</div>`,
        sku ? `<div style="font-size:9px;color:#333;">${escapeHtml(sku)}</div>` : "",
      ].join("");
    })
    .join("");

  const body = [
    `<div class="receipt" style="width:${widthPx}px;margin:0 auto;padding:8px;font-size:12px;line-height:1.35;">`,
    `<div style="text-align:center;font-weight:800;">${escapeHtml(company.name || "AWIK NET")}</div>`,
    company.tagline ? `<div style="text-align:center;font-size:10px;">${escapeHtml(company.tagline)}</div>` : "",
    company.address ? `<div style="text-align:center;font-size:10px;">${escapeHtml(company.address)}</div>` : "",
    company.phone ? `<div style="text-align:center;font-size:10px;">${escapeHtml(company.phone)}</div>` : "",
    `<hr style="border:none;border-top:1px dashed #000;margin:6px 0;" />`,
    `<table style="width:100%;font-size:11px;"><tr><td>Receipt</td><td style="text-align:right;">${escapeHtml(sale.saleNumber)}</td></tr>`,
    `<tr><td>Date</td><td style="text-align:right;">${escapeHtml(fmtDate(sale.createdAt))}</td></tr>`,
    cashierName ? `<tr><td>Served by</td><td style="text-align:right;">${escapeHtml(cashierName)}</td></tr>` : "",
    `<tr><td>Status</td><td style="text-align:right;">${escapeHtml(sale.status)}</td></tr></table>`,
    `<hr style="border:none;border-top:1px dashed #000;margin:6px 0;" />`,
    items,
    `<hr style="border:none;border-top:1px dashed #000;margin:6px 0;" />`,
    `<table style="width:100%;font-size:11px;"><tr><td>Subtotal</td><td style="text-align:right;">${subtotal}</td></tr></table>`,
    `<div style="display:flex;justify-content:space-between;font-weight:800;font-size:13px;margin:4px 0;"><span>TOTAL</span><span>${total}</span></div>`,
    `<table style="width:100%;font-size:11px;"><tr><td>Paid by</td><td style="text-align:right;">${escapeHtml(PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod)}</td></tr>`,
    `<tr><td>Currency</td><td style="text-align:right;">${escapeHtml(sale.currency)}</td></tr>`,
    sale.customer
      ? `<tr><td>Customer</td><td style="text-align:right;">${escapeHtml(
          `${sale.customer.firstName ?? ""} ${sale.customer.lastName ?? ""}`.trim()
        ).slice(0, 24)}</td></tr>`
      : "",
    `</table>`,
    ...qrLines,
    `<hr style="border:none;border-top:1px dashed #000;margin:6px 0;" />`,
    `<div style="text-align:center;font-size:10px;">${escapeHtml(footerMessage || "Thank you for your business")}</div>`,
    company.name ? `<div style="text-align:center;font-size:9px;margin-top:2px;">${escapeHtml(company.name)}</div>` : "",
    `</div>`,
  ].join("\n");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Receipt ${escapeHtml(sale.saleNumber)}</title><meta name="viewport" content="width=device-width, initial-scale=1.0"/><style>@page { size: ${paperWidth}mm auto; margin: 0; } * { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: 'Courier New', monospace; -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; color: #000; }</style></head><body>${body}</body></html>`;
}

function escapeHtml(s: unknown): string {
  const v = String(s ?? "");
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function printHtmlDocument(html: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.visibility = "hidden";
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow?.document;
      if (!doc) {
        iframe.remove();
        resolve();
        return;
      }
      doc.open();
      doc.write(html);
      doc.close();
      const win = iframe.contentWindow;
      win?.focus();
      const cleanup = () => {
        try {
          iframe.remove();
        } catch {}
        resolve();
      };
      win?.addEventListener("afterprint", cleanup, { once: true });
      setTimeout(cleanup, 60000);
      // Try print
      setTimeout(() => {
        win?.print();
      }, 250);
    } catch {
      resolve();
    }
  });
}