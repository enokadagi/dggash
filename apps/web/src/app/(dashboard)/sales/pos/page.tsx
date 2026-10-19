"use client";

import * as React from "react";
import Link from "next/link";
import { useProducts, useProductLookup, useCustomerSearch, type Product, type Customer } from "@/hooks/api/use-products";
import { useCreateSale, type Sale } from "@/hooks/api/use-sales";
import { useCreateCustomer } from "@/hooks/api/use-customers";
import { useCompanyProfile } from "@/hooks/api/use-company-settings";
import { useDebounce } from "@/hooks/use-debounce";
import { useWedgeScanner } from "@/hooks/use-wedge-scanner";
import { useLocalization } from "@/hooks/use-localization";
import { lookupProductByCode } from "@/lib/scanner/product-lookup";
import { ReceiptPrintButton } from "@/components/printer/receipt-print-button";
import { InvoicePrintButton } from "@/components/invoice/invoice-print-button";
import { A4Invoice, type InvoiceSale } from "@/components/invoice/a4-invoice";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ScannerStatus } from "@/components/scanner/scanner-status";
import { BarcodeScanner } from "@/components/barcode/barcode-scanner";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatCurrency } from "@/lib/utils";
import {
  ScanLine,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  User,
  UserPlus,
  PackageSearch,
  Check,
  ReceiptText,
  Layers,
  Camera,
  MessageCircle,
  Maximize2,
  Minimize2,
  Printer,
  Eraser,
} from "lucide-react";
import { openWhatsAppWeb, buildSaleReceiptText } from "@/lib/whatsapp-link";
interface CartLine {
  product: Product;
  quantity: number;
}

const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "credit", "other"] as const;

/**
 * Editable quantity field. Keeps a local draft so multi-digit values can be
 * typed freely, then commits a clamped integer on blur / Enter.
 */
function QuantityInput({
  value,
  max,
  onChange,
  ariaLabel,
}: {
  value: number;
  max: number;
  onChange: (next: number) => void;
  ariaLabel: string;
}) {
  const [draft, setDraft] = React.useState(String(value));

  React.useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(Math.max(parsed, 1), Math.max(max, 1));
    onChange(parsed);
    setDraft(String(clamped));
  };

  return (
    <Input
      type="number"
      inputMode="numeric"
      min={1}
      max={Math.max(max, 1)}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      aria-label={ariaLabel}
      className="h-8 w-16 text-center tabular-nums"
    />
  );
}

type PrintMode = "invoice" | "none";

export default function PosPage() {
  const { t } = useLocalization();
  const scannerRef = React.useRef<HTMLInputElement>(null);
  const [q, setQ] = React.useState("");
  const debouncedQ = useDebounce(q, 300);
  const [lookupError, setLookupError] = React.useState<string | null>(null);
  const [scanMessage, setScanMessage] = React.useState<string | null>(null);
  const [lastScannedProduct, setLastScannedProduct] = React.useState<Product | null>(null);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  /** Guards against a double click submitting the same sale twice. */
  const checkoutLock = React.useRef(false);
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("cash");
  const [notes, setNotes] = React.useState("");
  const [customerDialogOpen, setCustomerDialogOpen] = React.useState(false);
  const [newCustomer, setNewCustomer] = React.useState({ firstName: "", lastName: "", phone: "" });
  const [customerFormError, setCustomerFormError] = React.useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = React.useState<null | {
    saleNumber: string;
    totalAmount: number;
    currency: string;
    items: number;
    detail: Sale;
  }>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [clearOpen, setClearOpen] = React.useState(false);
  const [autoPrintInvoice, setAutoPrintInvoice] = React.useState(false);
  const companyProfile = useCompanyProfile();

  const lookup = useProductLookup(debouncedQ);
  const quickProducts = useProducts({ limit: 12 });
  const quickItems = quickProducts.data?.data || [];
  const customerSearch = useCustomerSearch(customerQuery);
  const createSale = useCreateSale();
  const createCustomer = useCreateCustomer();

  const customerResults = customerSearch.data || [];

  React.useEffect(() => {
    if (customerResults.length === 1) {
      setCustomer(customerResults[0]);
      setCustomerQuery("");
    }
  }, [customerResults]);

  React.useEffect(() => {
    const onChange = () =>
      setIsFullscreen(
        typeof document !== "undefined" && document.fullscreenElement === containerRef.current
      );
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = React.useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current?.requestFullscreen?.();
      }
    } catch {
      // Fullscreen is optional; the POS keeps working without it.
    }
  }, []);

  const addToCart = React.useCallback((product: Product): boolean => {
    if (!product.isActive) {
      setScanMessage(`"${product.name}" is inactive and cannot be sold.`);
      return false;
    }
    if (product.currentStock <= 0) {
      setScanMessage(`"${product.name}" is out of stock.`);
      return false;
    }

    let added = false;
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.currentStock) {
          setScanMessage(
            `Only ${product.currentStock} x "${product.name}" left in stock.`
          );
          return prev;
        }
        added = true;
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      added = true;
      return [...prev, { product, quantity: 1 }];
    });

    if (added) {
      setScanMessage(null);
      setLastScannedProduct(product);
      setQ("");
      // Return focus so the next scan keeps landing on the scan box.
      requestAnimationFrame(() => scannerRef.current?.focus());
    }
    return added;
  }, []);

  const setQty = (id: string, qty: number) => {
    const line = cart.find((l) => l.product.id === id);
    if (!line) return;
    const max = Math.max(1, Math.floor(Number(line.product.currentStock) || 0));
    const parsed = Number.isFinite(qty) ? Math.floor(qty) : 1;
    const safeQty = Math.max(1, parsed);
    if (safeQty > max) {
      setScanMessage(t("pos.stockLimit", { count: max, name: line.product.name }));
    }
    setCart((prev) =>
      prev.map((l) =>
        l.product.id === id ? { ...l, quantity: Math.min(safeQty, max) } : l
      )
    );
  };

  const removeLine = (id: string) => {
    setCart((prev) => prev.filter((l) => l.product.id !== id));
  };

  const clearCart = () => {
    setCart([]);
    setCustomer(null);
    setCustomerQuery("");
    setNotes("");
    setScanMessage(null);
    setLastScannedProduct(null);
    checkoutLock.current = false;
    setClearOpen(false);
  };

  const total = cart.reduce((sum, l) => sum + Number(l.product.sellingPrice) * l.quantity, 0);
  const currency = cart[0]?.product.currency || "USD";
  const isCheckingOut = createSale.isPending;

  const handleCreateCustomer = async () => {
    setCustomerFormError(null);
    if (!/^\+[1-9]\d{1,14}$/.test(newCustomer.phone.trim())) {
      setCustomerFormError(t("pos.phoneRequired"));
      return;
    }
    if (!newCustomer.firstName.trim() || !newCustomer.lastName.trim()) {
      setCustomerFormError(t("pos.customerNameRequired"));
      return;
    }
    try {
      const created = await createCustomer.mutateAsync({
        phone: newCustomer.phone.trim(),
        firstName: newCustomer.firstName.trim(),
        lastName: newCustomer.lastName.trim(),
      });
      setCustomer({
        id: created.id,
        firstName: created.firstName,
        lastName: created.lastName,
        phone: created.phone,
      });
      setCustomerDialogOpen(false);
      setNewCustomer({ firstName: "", lastName: "", phone: "" });
      setCustomerQuery("");
    } catch {
      // toast handled by the mutation
    }
  };

  /**
   * Resolves a code through the canonical lookup shared with the camera scanner,
   * then adds it to the cart. Never throws, so a bad scan or a network failure
   * cannot take down the open sale.
   */
  const addByCode = React.useCallback(
    async (rawCode: string) => {
      const result = await lookupProductByCode(rawCode);

      if (result.ok && result.product) {
        addToCart(result.product);
        return;
      }

      setLookupError(null);
      setScanMessage(
        result.message ??
          `No product found for "${result.code}". Check the barcode and try again.`
      );
      requestAnimationFrame(() => scannerRef.current?.focus());
    },
    [addToCart]
  );

  // HENEX 2D (USB-KBW) global detector. Replaces the previous ad-hoc buffer,
  // which relied purely on a 100ms stall and would happily look up whatever a
  // human typed outside an input field.
  const wedge = useWedgeScanner({
    onScan: (value) => {
      void addByCode(value);
    },
  });

  const scanOrSearch = () => {
    if (!q.trim()) return;
    void addByCode(q);
  };

  const performCheckout = (mode: PrintMode) => {
    if (cart.length === 0) return;
    // Repeated clicks on "Complete Sale" must not create two sales.
    if (checkoutLock.current || createSale.isPending) return;
    checkoutLock.current = true;
    setCheckoutOpen(false);
    setPreviewOpen(false);

    createSale.mutate(
      {
        items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        customerId: customer?.id,
        paymentMethod,
        currency,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (resp) => {
          setLastReceipt({
            saleNumber: resp.receipt.saleNumber,
            totalAmount: resp.receipt.totalAmount,
            currency: resp.receipt.currency,
            items: resp.receipt.items,
            // Kept so the receipt can be printed (or re-printed) from the
            // success screen without another server round-trip.
            detail: resp.sale,
          });
          setAutoPrintInvoice(mode === "invoice");
          setCart([]);
          setCustomer(null);
          setCustomerQuery("");
          setNotes("");
        },
        // Release the lock on failure so the cashier can correct and retry.
        onError: () => {
          checkoutLock.current = false;
        },
        onSettled: () => {
          checkoutLock.current = false;
        },
      }
    );
  };

  const openCheckout = () => {
    if (cart.length === 0) return;
    setCheckoutOpen(true);
  };

  const draftSale: InvoiceSale = React.useMemo(
    () => ({
      id: "draft",
      saleNumber: "—",
      totalAmount: total,
      currency,
      paymentMethod,
      status: "DRAFT",
      notes: notes.trim() || null,
      createdAt: new Date().toISOString(),
      customer: customer
        ? {
            firstName: customer.firstName,
            lastName: customer.lastName,
            phone: customer.phone,
          }
        : null,
      items: cart.map((l, index) => ({
        id: `draft-${l.product.id}-${index}`,
        quantity: l.quantity,
        unitPrice: Number(l.product.sellingPrice),
        totalPrice: Number(l.product.sellingPrice) * l.quantity,
        product: {
          name: l.product.name,
          sku: l.product.sku,
          barcode: l.product.barcode,
          unit: l.product.unit,
        },
      })),
    }),
    [total, currency, paymentMethod, notes, customer, cart]
  );

  const resetAfterReceipt = () => {
    setLastReceipt(null);
    setAutoPrintInvoice(false);
    setQ("");
    requestAnimationFrame(() => scannerRef.current?.focus());
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "space-y-6",
        isFullscreen &&
          "fixed inset-0 z-50 flex h-screen flex-col overflow-hidden bg-background p-4 space-y-4"
      )}
    >
      <PageHeader
        title={t("pos.title")}
        description={t("pos.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <ScannerStatus status={wedge.status} lastScanned={wedge.lastScanned} />
            <Button
              type="button"
              variant="outline"
              onClick={() => void toggleFullscreen()}
              title={isFullscreen ? t("pos.exitFullscreen") : t("pos.fullscreen")}
            >
              {isFullscreen ? (
                <Minimize2 className="me-2 h-4 w-4" />
              ) : (
                <Maximize2 className="me-2 h-4 w-4" />
              )}
              {isFullscreen ? t("pos.exitFullscreen") : t("pos.fullscreen")}
            </Button>
            <Button asChild variant="outline">
              <Link href="/sales">
                <ReceiptText className="me-2 h-4 w-4" />
                {t("sales.history")}
              </Link>
            </Button>
          </div>
        }
      />

      <div
        className={cn(
          "grid gap-6 lg:grid-cols-3",
          isFullscreen && "min-h-0 flex-1"
        )}
      >
        <div
          className={cn(
            "space-y-6 lg:col-span-2",
            isFullscreen && "min-h-0 overflow-y-auto pe-1"
          )}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ScanLine className="h-4 w-4" />
                {t("pos.scanTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  ref={scannerRef}
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setLookupError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && scanOrSearch()}
                  placeholder={t("pos.scanPlaceholder")}
                  className="flex-1"
                  autoFocus
                />
                <Button onClick={scanOrSearch} disabled={!q.trim()}>
                  {t("pos.scanOrSearch")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCameraOpen(true)}
                  title={t("pos.camera")}
                >
                  <Camera className="me-2 h-4 w-4" />
                  {t("pos.camera")}
                </Button>
              </div>

              {/* The camera scanner feeds the exact same backend lookup as the
                  USB keyboard-wedge device, so both resolve identically. */}
              <BarcodeScanner
                open={cameraOpen}
                onOpenChange={setCameraOpen}
                onDetected={(value) => {
                  void addByCode(value);
                }}
                title={t("pos.scanTitle")}
                description={t("pos.scanPlaceholder")}
              />

              {/* Scan feedback. Always visible (not gated on the search box) so
                  the cashier gets immediate confirmation or a clear failure. */}
              {scanMessage ? (
                <div
                  role="alert"
                  data-testid="scan-message"
                  className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <PackageSearch className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{scanMessage}</span>
                </div>
              ) : lastScannedProduct ? (
                <div
                  role="status"
                  data-testid="scan-success"
                  className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-sm"
                >
                  <Check className="h-4 w-4 shrink-0 text-success" />
                  <span>
                    <strong>{lastScannedProduct.name}</strong> ({lastScannedProduct.sku})
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t("pos.scanHint")}</p>
              )}

              {debouncedQ && (
                <div>
                  {lookup.isLoading && (
                    <p className="text-sm text-muted-foreground">{t("pos.lookingUp")}</p>
                  )}
                  {!lookup.isLoading && !lookup.data && (
                    <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground">
                      <PackageSearch className="h-4 w-4" />
                      {t("pos.noProductFound")} &quot;{debouncedQ}&quot;
                    </div>
                  )}
                  {!lookup.isLoading && lookup.data && (
                    <div className="flex items-center gap-4 rounded-md border p-4">
                      <div className="flex-1">
                        <p className="font-medium">{lookup.data.name}</p>
                        <p className="text-sm text-muted-foreground">
                          SKU {lookup.data.sku} · {lookup.data.currentStock} {t("pos.inStock")}
                        </p>
                      </div>
                      <p className="font-semibold tabular-nums">
                        {formatCurrency(Number(lookup.data.sellingPrice), lookup.data.currency)}
                      </p>
                      <Button
                        size="sm"
                        onClick={() => addToCart(lookup.data!)}
                        disabled={lookup.data.currentStock <= 0 || !lookup.data.isActive}
                      >
                        <Plus className="me-1 h-4 w-4" />
                        {t("common.add")}
                      </Button>
                    </div>
                  )}
                  {lookupError ? (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                      <PackageSearch className="h-4 w-4 shrink-0" />
                      {lookupError}
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4" />
                {t("pos.quickAdd")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quickProducts.isLoading ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-md" />
                  ))}
                </div>
              ) : quickItems.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t("pos.noProducts")}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {quickItems.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={p.currentStock <= 0 || !p.isActive}
                      onClick={() => addToCart(p)}
                      className="flex h-full flex-col items-start justify-between rounded-md border p-3 text-start transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="w-full min-w-0">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.sku}</p>
                      </div>
                      <div className="mt-2 flex w-full items-center justify-between gap-1">
                        <span className="text-sm font-semibold tabular-nums">
                          {formatCurrency(Number(p.sellingPrice), p.currency)}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {p.currentStock} {t("pos.inStock")}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                {t("pos.customerOptional")}
              </CardTitle>
              {!customer ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCustomerFormError(null);
                    setCustomerDialogOpen(true);
                  }}
                >
                  <UserPlus className="me-1 h-4 w-4" />
                  {t("pos.addCustomer")}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              {customer ? (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">
                      {customer.firstName} {customer.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">{customer.phone}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setCustomer(null)}>
                    {t("pos.remove")}
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    placeholder={t("pos.searchCustomerPlaceholder")}
                  />
                  {customerResults.length > 0 && (
                    <ul className="divide-y rounded-md border">
                      {customerResults.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-accent"
                            onClick={() => {
                              setCustomer(c);
                              setCustomerQuery("");
                            }}
                          >
                            <span>
                              {c.firstName} {c.lastName}
                            </span>
                            <span className="text-muted-foreground">{c.phone}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card
          className={cn(
            "lg:col-span-1 lg:self-start",
            isFullscreen && "min-h-0 overflow-y-auto"
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4" />
              {t("pos.currentSale")}
            </CardTitle>
            {!lastReceipt && cart.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setClearOpen(true)}
              >
                <Eraser className="me-1 h-4 w-4" />
                {t("pos.clearCart")}
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {lastReceipt ? (
              <div className="space-y-3">
                <div className="rounded-md border border-success/30 bg-success/10 p-4 text-center">
                  <p className="text-sm font-medium text-success">{t("pos.saleCompleted")}</p>
                  <p className="mt-1 font-mono text-lg font-bold">{lastReceipt.saleNumber}</p>
                  <p className="mt-1 text-2xl font-bold">
                    {formatCurrency(lastReceipt.totalAmount, lastReceipt.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lastReceipt.items} {t("sales.items")}
                  </p>
                  {lastReceipt.detail.customer ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("pos.customer")}: {lastReceipt.detail.customer.firstName}{" "}
                      {lastReceipt.detail.customer.lastName}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  {/* Primary company document output: a real A4 invoice. */}
                  <InvoicePrintButton
                    sale={lastReceipt.detail as unknown as InvoiceSale}
                    label={t("sales.title")}
                    autoPrint={autoPrintInvoice}
                    onPrinted={() => setAutoPrintInvoice(false)}
                  />
                  {/* Optional thermal receipt, independent of A4 printing. */}
                  <ReceiptPrintButton
                    sale={lastReceipt.detail}
                    cashierName={
                      lastReceipt.detail.user
                        ? `${lastReceipt.detail.user.firstName} ${lastReceipt.detail.user.lastName}`.trim()
                        : undefined
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="border-green-200 text-green-700 hover:bg-green-50"
                    onClick={() => {
                      const cust = lastReceipt.detail.customer;
                      const text = buildSaleReceiptText({
                        customerName: cust ? `${cust.firstName} ${cust.lastName}`.trim() : null,
                        saleNumber: lastReceipt.saleNumber,
                        totalAmount: lastReceipt.totalAmount,
                        currency: lastReceipt.currency,
                        itemsCount: lastReceipt.items,
                      });
                      openWhatsAppWeb(cust?.phone || "", text);
                    }}
                  >
                    <MessageCircle className="me-2 h-4 w-4 text-green-600" />
                    {t("pos.sendWhatsapp")}
                  </Button>
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={resetAfterReceipt}>
                      {t("pos.newSale")}
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={`/sales/detail?id=${encodeURIComponent(createSale.data?.sale.id ?? "")}`}>{t("pos.view")}</Link>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {cart.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("pos.startSale")}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {cart.map((line) => (
                      <li key={line.product.id} className="flex flex-col gap-2 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium leading-tight">
                            {line.product.name}
                          </p>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeLine(line.product.id)}
                            aria-label={`${t("pos.remove")} ${line.product.name}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon-sm"
                              onClick={() => setQty(line.product.id, line.quantity - 1)}
                              disabled={line.quantity <= 1}
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <QuantityInput
                              value={line.quantity}
                              max={Math.max(1, Math.floor(Number(line.product.currentStock) || 0))}
                              onChange={(next) => setQty(line.product.id, next)}
                              ariaLabel={`${t("pos.quantity")} — ${line.product.name}`}
                            />
                            <Button
                              variant="outline"
                              size="icon-sm"
                              onClick={() => setQty(line.product.id, line.quantity + 1)}
                              disabled={line.quantity >= line.product.currentStock}
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-sm font-medium tabular-nums">
                            {formatCurrency(
                              Number(line.product.sellingPrice) * line.quantity,
                              line.product.currency
                            )}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="space-y-4 border-t pt-4">
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t("pos.paymentMethodLabel")}
                    </p>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            <span className="capitalize">{m.replace(/_/g, " ")}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t("pos.notesPlaceholder")}
                    className="h-9 w-full"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {cart.length} {t("sales.items")}
                      {customer ? " · " + (customer.firstName || "") + " " + (customer.lastName || "") : ""}
                    </p>
                    <p className="text-2xl font-bold tabular-nums">
                      {formatCurrency(total, currency)}
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={openCheckout}
                    disabled={cart.length === 0 || isCheckingOut}
                  >
                    {isCheckingOut ? t("pos.completing") : t("pos.completeSale")}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title={t("pos.clearCart")}
        description={t("pos.clearCartConfirm")}
        confirmLabel={t("pos.clearCart")}
        onConfirm={clearCart}
        destructive
      />

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pos.printOptionsTitle")}</DialogTitle>
            <DialogDescription>{t("pos.printOptionsDescription")}</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-4 text-center">
            <p className="text-sm text-muted-foreground">{t("pos.total")}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(total, currency)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {cart.length} {t("sales.items")}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={() => performCheckout("invoice")}>
              <Printer className="me-2 h-4 w-4" />
              {t("pos.saveAndPrint")}
            </Button>
            <Button size="lg" variant="outline" onClick={() => performCheckout("none")}>
              {t("pos.saveOnly")}
            </Button>
            <Button size="lg" variant="ghost" onClick={() => {
              setCheckoutOpen(false);
              setPreviewOpen(true);
            }}>
              {t("pos.printPreview")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-[min(95vw,820px)] overflow-auto p-4">
          <DialogHeader>
            <DialogTitle>{t("pos.printPreview")}</DialogTitle>
            <DialogDescription>{t("pos.printOptionsDescription")}</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/20 p-2">
            <A4Invoice sale={draftSale} company={companyProfile.data} reprint />
          </div>
          <DialogFooter className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              {t("common.back")}
            </Button>
            <InvoicePrintButton sale={draftSale} label={t("pos.saveAndPrint")} reprint />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pos.newCustomer")}</DialogTitle>
            <DialogDescription>{t("pos.addCustomer")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pos-customer-phone">{t("customers.phone")}</Label>
              <Input
                id="pos-customer-phone"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="+96170000000"
                inputMode="tel"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pos-customer-first">{t("auth.firstName")}</Label>
                <Input
                  id="pos-customer-first"
                  value={newCustomer.firstName}
                  onChange={(e) => setNewCustomer((prev) => ({ ...prev, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pos-customer-last">{t("auth.lastName")}</Label>
                <Input
                  id="pos-customer-last"
                  value={newCustomer.lastName}
                  onChange={(e) => setNewCustomer((prev) => ({ ...prev, lastName: e.target.value }))}
                />
              </div>
            </div>
            {customerFormError ? (
              <p className="text-xs text-destructive">{customerFormError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomerDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCreateCustomer} disabled={createCustomer.isPending}>
              {createCustomer.isPending ? t("pos.creating") : t("pos.createCustomer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
