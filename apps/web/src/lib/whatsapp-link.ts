/**
 * Utility functions for generating direct WhatsApp (wa.me) links.
 * Works 100% free with standard WhatsApp and WhatsApp Business (Web, Mobile, Desktop)
 * without requiring any Meta Cloud API keys, credit cards, or account verification.
 */

export function formatWhatsAppPhone(phone: string): string {
  if (!phone) return "";
  let digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  return digits;
}

export function createWhatsAppWebUrl(phone: string, text: string): string {
  const cleanPhone = formatWhatsAppPhone(phone);
  const encodedText = encodeURIComponent(text);
  if (!cleanPhone) {
    return `https://wa.me/?text=${encodedText}`;
  }
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

export function openWhatsAppWeb(phone: string, text: string): void {
  const url = createWhatsAppWebUrl(phone, text);
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function buildExpiryReminderText(options: {
  customerName: string;
  planName?: string | null;
  daysRemaining?: number | string;
  expiryDate: string;
  price?: number | string;
  companyName?: string;
}): string {
  const company = options.companyName || "AWIK NET";
  const days = options.daysRemaining !== undefined ? String(options.daysRemaining) : "";
  
  if (days === "0" || days === "today") {
    return `Hello ${options.customerName},\n\nYour ${company} internet subscription expired today (${options.expiryDate}).\n\nTo restore your internet service immediately, please visit our office or contact us to renew.\n\nPlan: ${options.planName || "Internet Plan"}\n${options.price ? `Price: $${options.price}\n` : ""}\nThank you,\n${company} — INTERNET SERVICE PROVIDER`;
  }

  if (days === "1") {
    return `Hello ${options.customerName},\n\nYour ${company} internet subscription expires TOMORROW on ${options.expiryDate}.\n\nPlease renew your subscription to avoid any interruption in service.\n\nPlan: ${options.planName || "Internet Plan"}\n${options.price ? `Price: $${options.price}\n` : ""}\nThank you,\n${company} — INTERNET SERVICE PROVIDER`;
  }

  return `Hello ${options.customerName},\n\nYour ${company} internet subscription will expire in ${days || "a few"} days on ${options.expiryDate}.\n\nPlease recharge or renew your service.\n\nPlan: ${options.planName || "Internet Plan"}\n${options.price ? `Price: $${options.price}\n` : ""}\nThank you,\n${company} — INTERNET SERVICE PROVIDER`;
}

export function buildSaleReceiptText(options: {
  customerName?: string | null;
  saleNumber: string;
  totalAmount: number | string;
  currency?: string;
  itemsCount: number;
  companyName?: string;
}): string {
  const company = options.companyName || "AWIK NET";
  const greeting = options.customerName ? `Hello ${options.customerName},\n\n` : "Hello,\n\n";
  const curr = options.currency || "USD";
  
  return `${greeting}Thank you for your purchase from ${company}!\n\nInvoice: ${options.saleNumber}\nTotal: $${Number(options.totalAmount).toFixed(2)} ${curr}\nItems: ${options.itemsCount} line items\nDate: ${new Date().toLocaleDateString("en-GB")}\n\nThank you for choosing ${company}!`;
}
