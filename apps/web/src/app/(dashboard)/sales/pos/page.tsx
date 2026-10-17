"use client";

import * as React from "react";
import Link from "next/link";
import { useProducts, useProductLookup, useCustomerSearch, type Product, type Customer } from "@/hooks/api/use-products";
import { useCreateSale, type Sale } from "@/hooks/api/use-sales";
import { useDebounce } from "@/hooks/use-debounce";
import { useWedgeScanner } from "@/hooks/use-wedge-scanner";
import { lookupProductByCode } from "@/lib/scanner/product-lookup";
import { ReceiptPrintButton } from "@/components/printer/receipt-print-button";
import { InvoicePrintButton } from "@/components/invoice/invoice-print-button";
import type { InvoiceSale } from "@/components/invoice/a4-invoice";
import { ScannerStatus } from "@/components/scanner/scanner-status";
import { BarcodeScanner } from "@/components/barcode/barcode-scanner";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import {
  ScanLine,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  User,
  PackageSearch,
  Check,
  ReceiptText,
  Layers,
  Camera,
  MessageCircle,
} from "lucide-react";
import { openWhatsAppWeb, buildSaleReceiptText } from "@/lib/whatsapp-link";
interface CartLine {
  product: Product;
  quantity: number;
}

const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "credit", "other"] as const;

export default function PosPage() {
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
  const [lastReceipt, setLastReceipt] = React.useState<null | {
    saleNumber: string;
    totalAmount: number;
    currency: string;
    items: number;
    detail: Sale;
  }>(null);

  const lookup = useProductLookup(debouncedQ);
  const quickProducts = useProducts({ limit: 12 });
  const quickItems = quickProducts.data?.data || [];
  const customerSearch = useCustomerSearch(customerQuery);
  const createSale = useCreateSale();

  const customerResults = customerSearch.data || [];

  React.useEffect(() => {
    if (customerResults.length === 1) {
      setCustomer(customerResults[0]);
      setCustomerQuery("");
    }
  }, [customerResults]);

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
    setCart((prev) =>
      prev
        .map((l) =>
          l.product.id === id
            ? { ...l, quantity: Math.min(Math.max(qty, 1), l.product.currentStock) }
            : l
        )
        .filter((l) => l.quantity > 0)
    );
  };

  const removeLine = (id: string) => {
    setCart((prev) => prev.filter((l) => l.product.id !== id));
  };

  const total = cart.reduce((sum, l) => sum + Number(l.product.sellingPrice) * l.quantity, 0);
  const currency = cart[0]?.product.currency || "USD";
  const isCheckingOut = createSale.isPending;

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

  const checkout = () => {
    if (cart.length === 0) return;
    // Repeated clicks on "Complete Sale" must not create two sales.
    if (checkoutLock.current || createSale.isPending) return;
    checkoutLock.current = true;

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

  const resetAfterReceipt = () => {
    setLastReceipt(null);
    setQ("");
    requestAnimationFrame(() => scannerRef.current?.focus());
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Point of Sale"
        description="Scan barcodes or search to build the cart, then check out"
        actions={
          <div className="flex items-center gap-3">
            <ScannerStatus status={wedge.status} lastScanned={wedge.lastScanned} />
            <Button asChild variant="outline">
              <Link href="/sales">
                <ReceiptText className="me-2 h-4 w-4" />
                Sales History
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ScanLine className="h-4 w-4" />
                Scan or Search
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
                  placeholder="Scan barcode or type product name / SKU..."
                  className="flex-1"
                  autoFocus
                />
                <Button onClick={scanOrSearch} disabled={!q.trim()}>
                  Add
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCameraOpen(true)}
                  title="Scan with the device camera instead of a USB scanner"
                >
                  <Camera className="me-2 h-4 w-4" />
                  Camera
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
                title="Scan product"
                description="Point the camera at a barcode or QR code, or use a USB scanner in the field below."
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
                    Added <strong>{lastScannedProduct.name}</strong> (SKU{" "}
                    {lastScannedProduct.sku})
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  USB scanner (HENEX 2D, keyboard mode) is live — just scan. Human typing never
                  triggers a lookup.
                </p>
              )}

              {debouncedQ && (
                <div>
                  {lookup.isLoading && (
                    <p className="text-sm text-muted-foreground">Looking up...</p>
                  )}
                  {!lookup.isLoading && !lookup.data && (
                    <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground">
                      <PackageSearch className="h-4 w-4" />
                      No product found for &quot;{debouncedQ}&quot;
                    </div>
                  )}
                  {!lookup.isLoading && lookup.data && (
                    <div className="flex items-center gap-4 rounded-md border p-4">
                      <div className="flex-1">
                        <p className="font-medium">{lookup.data.name}</p>
                        <p className="text-sm text-muted-foreground">
                          SKU {lookup.data.sku} · Stock {lookup.data.currentStock}
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
                          Add
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
                Quick Add
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
                  No products available yet.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {quickItems.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={p.currentStock <= 0 || !p.isActive}
                      onClick={() => addToCart(p)}
                      className="flex h-full flex-col items-start justify-between rounded-md border p-3 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
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
                          {p.currentStock} in stock
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                Customer (optional)
              </CardTitle>
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
                    Remove
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    placeholder="Search customer by name or phone..."
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

        <Card className="lg:col-span-1 lg:self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4" />
              Current Sale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {lastReceipt ? (
              <div className="space-y-3">
                <div className="rounded-md border border-success/30 bg-success/10 p-4 text-center">
                  <p className="text-sm font-medium text-success">Sale completed</p>
                  <p className="mt-1 font-mono text-lg font-bold">{lastReceipt.saleNumber}</p>
                  <p className="mt-1 text-2xl font-bold">
                    {formatCurrency(lastReceipt.totalAmount, lastReceipt.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lastReceipt.items} line item{lastReceipt.items === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {/* Primary company document output: a real A4 invoice. */}
                  <InvoicePrintButton
                    sale={lastReceipt.detail as unknown as InvoiceSale}
                    label="Print A4 Invoice"
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
                    Send WhatsApp Receipt (Free)
                  </Button>
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={resetAfterReceipt}>
                      New Sale
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={`/sales/detail?id=${encodeURIComponent(createSale.data?.sale.id ?? "")}`}>View</Link>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {cart.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Scan or search a product to start the sale.
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
                            aria-label={`Remove ${line.product.name}`}
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
                            <span className="w-8 text-center text-sm tabular-nums">
                              {line.quantity}
                            </span>
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
                      Payment method
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
                    placeholder="Notes (optional)"
                    className="h-9 w-full"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {cart.length} item{cart.length === 1 ? "" : "s"}
                      {customer ? " · " + (customer.firstName || "") + " " + (customer.lastName || "") : ""}
                    </p>
                    <p className="text-2xl font-bold tabular-nums">
                      {formatCurrency(total, currency)}
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={checkout}
                    disabled={cart.length === 0 || isCheckingOut}
                  >
                    {isCheckingOut ? "Completing..." : "Complete Sale"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}