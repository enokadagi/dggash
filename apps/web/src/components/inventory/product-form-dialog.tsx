"use client";

import * as React from "react";
import { CircleAlert, Dices, Package, Printer, QrCode as QrIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { BarcodeField } from "@/components/barcode/barcode-field";
import { DownloadQrButton, PrintLabelButton, ProductLabel } from "@/components/barcode/product-label";
import {
  useCreateProduct,
  useInventoryCategories,
  useUpdateProduct,
  type Product,
  type ProductInput,
} from "@/hooks/api/use-products";
import { useProductLookup } from "@/hooks/api/use-products";
import { useDebounce } from "@/hooks/use-debounce";
import { generateSku } from "@/lib/barcode";
import { formatCurrency } from "@/lib/utils";

const EMPTY_FORM = {
  name: "",
  sku: "",
  barcode: "",
  categoryId: "",
  purchasePrice: "",
  sellingPrice: "",
  currentStock: "0",
  minStock: "0",
  unit: "piece",
  description: "",
};

type FormState = typeof EMPTY_FORM;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

function MarginBadge({ purchase, selling }: { purchase: number; selling: number }) {
  if (purchase <= 0 || selling <= 0) return null;
  const margin = ((selling - purchase) / selling) * 100;
  const healthy = margin >= 0;
  return (
    <span className={healthy ? "text-[11px] text-success" : "text-[11px] text-destructive"}>
      {margin >= 0 ? "Margin" : "Loss"} {Math.abs(margin).toFixed(1)}%
    </span>
  );
}

export interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create a new product. */
  product?: Product | null;
}

export function ProductFormDialog({ open, onOpenChange, product }: ProductFormDialogProps) {
  const isEdit = Boolean(product);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [showLabel, setShowLabel] = React.useState(false);
  const [saved, setSaved] = React.useState<Product | null>(null);

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const categories = useInventoryCategories(open);
  const debouncedBarcode = useDebounce(form.barcode.trim(), 400);

  // Warn early when the code is already used by another product.
  const lookup = useProductLookup(debouncedBarcode);
  const duplicateMessage = React.useMemo(() => {
    if (!debouncedBarcode || debouncedBarcode.length < 4) return null;
    const match = lookup.data;
    if (!match) return null;
    if (isEdit && product && match.id === product.id) return null;
    return `Already used by "${match.name}" (${match.sku}). Use a different code.`;
  }, [debouncedBarcode, lookup.data, isEdit, product]);

  React.useEffect(() => {
    if (!open) return;
    setSaved(null);
    setShowLabel(false);
    if (product) {
      setForm({
        name: product.name ?? "",
        sku: product.sku ?? "",
        barcode: product.barcode ?? "",
        categoryId: product.category?.id ?? "",
        purchasePrice: String(product.purchasePrice ?? ""),
        sellingPrice: String(product.sellingPrice ?? ""),
        currentStock: String(product.currentStock ?? 0),
        minStock: String(product.minStock ?? 0),
        unit: product.unit || "piece",
        description: product.description ?? "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, product]);

  const update = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const purchase = Number(form.purchasePrice);
  const selling = Number(form.sellingPrice);
  const categoryIdValid = isEdit ? true : Boolean(form.categoryId);

  const canSave =
    Boolean(form.name.trim()) &&
    Boolean(form.sku.trim()) &&
    Boolean(form.sellingPrice) &&
    form.purchasePrice !== "" &&
    categoryIdValid &&
    !duplicateMessage;

  const buildInput = (): ProductInput => {
    const base: ProductInput = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      barcode: form.barcode.trim() || null,
      categoryId: form.categoryId,
      purchasePrice: Number(form.purchasePrice),
      sellingPrice: Number(form.sellingPrice),
      minStock: Math.max(0, Number(form.minStock) || 0),
      unit: form.unit.trim() || "piece",
      description: form.description.trim() || null,
    };
    if (!isEdit) {
      base.initialStock = Math.max(0, Number(form.currentStock) || 0);
    }
    // An empty category would break the update call, so only send it when set.
    if (!base.categoryId) {
      delete base.categoryId;
    }
    return base;
  };

  const handleSubmit = () => {
    if (!canSave) return;
    const input = buildInput();

    if (isEdit && product) {
      updateProduct.mutate(
        { id: product.id, input },
        {
          onSuccess: (updated) => {
            toast.success("Product updated");
            setSaved(updated);
            onOpenChange(false);
          },
          onError: (error: { message?: string }) =>
            toast.error(error.message || "Failed to update product"),
        }
      );
      return;
    }

    createProduct.mutate(input, {
      onSuccess: (created) => {
        toast.success("Product created");
        setSaved(created);
        setForm(EMPTY_FORM);
        onOpenChange(false);
      },
      onError: (error: { message?: string }) => toast.error(error.message || "Failed to create product"),
    });
  };

  const pending = createProduct.isPending || updateProduct.isPending;

  const labelData = {
    id: (saved || product)?.id,
    sku: (saved || product)?.sku || form.sku || "—",
    barcode: (saved || product)?.barcode || form.barcode || null,
    name: (saved || product)?.name || form.name || "New product",
    price: selling || purchase || 0,
    currency: (saved || product)?.currency || "USD",
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="gap-3 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              {isEdit ? "Edit Product" : "Add Product"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Update the product details. Stock levels change through Restock, not here."
                : "Create a product. Scan a barcode or let us generate one, then fill in the rest."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <section className="space-y-2.5">
              <SectionTitle>Identification</SectionTitle>
              <div className="space-y-1.5">
                <Label htmlFor="pf-name">Product name</Label>
                <Input
                  id="pf-name"
                  value={form.name}
                  onChange={update("name")}
                  placeholder="MikroTik hAP ac2"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pf-sku">SKU</Label>
                  {!isEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setForm((c) => ({ ...c, sku: generateSku(c.name) }))}
                      disabled={!form.name.trim()}
                    >
                      <Sparkles className="me-1 h-3 w-3" />
                      Suggest
                    </Button>
                  )}
                </div>
                <Input
                  id="pf-sku"
                  value={form.sku}
                  onChange={update("sku")}
                  placeholder="MIK-HAPAC2"
                  className="font-mono"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pf-barcode">Barcode / QR value</Label>
                <BarcodeField
                  value={form.barcode}
                  onChange={(value) => setForm((c) => ({ ...c, barcode: value }))}
                  onScanned={(code) =>
                    toast.success(`Scanned ${code}`, { description: "Fill in the remaining details to save." })
                  }
                  duplicateMessage={duplicateMessage}
                />
                <p className="text-[11px] text-muted-foreground">
                  Scan with a USB scanner or the camera, tap the dice to generate a valid EAN-13, or
                  paste a QR payload. A unique code lets the POS look the product up instantly.
                </p>
              </div>
            </section>

            <section className="space-y-2.5">
              <SectionTitle>Category &amp; unit</SectionTitle>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pf-category">Category</Label>
                  <Select
                    value={form.categoryId || undefined}
                    onValueChange={(value) => setForm((c) => ({ ...c, categoryId: value }))}
                  >
                    <SelectTrigger id="pf-category" className="h-10">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {(categories.data || []).map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isEdit && !form.categoryId && (
                    <p className="text-[11px] text-muted-foreground">
                      Category unknown — pick one to set it.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pf-unit">Unit</Label>
                  <Input id="pf-unit" value={form.unit} onChange={update("unit")} placeholder="piece" />
                </div>
              </div>
            </section>

            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <SectionTitle>Pricing</SectionTitle>
                <MarginBadge purchase={purchase} selling={selling} />
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pf-purchase">Purchase price</Label>
                  <Input
                    id="pf-purchase"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={form.purchasePrice}
                    onChange={update("purchasePrice")}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pf-selling">Selling price</Label>
                  <Input
                    id="pf-selling"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={form.sellingPrice}
                    onChange={update("sellingPrice")}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-2.5">
              <SectionTitle>Stock</SectionTitle>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pf-stock">{isEdit ? "Current stock" : "Opening stock"}</Label>
                  <Input
                    id="pf-stock"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={form.currentStock}
                    onChange={isEdit ? undefined : update("currentStock")}
                    disabled={isEdit}
                  />
                  {isEdit && (
                    <p className="text-[11px] text-muted-foreground">Use Restock to add units.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pf-minstock">Minimum stock (alert level)</Label>
                  <Input
                    id="pf-minstock"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={form.minStock}
                    onChange={update("minStock")}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-1.5">
              <Label htmlFor="pf-description">Description</Label>
              <Textarea
                id="pf-description"
                rows={2}
                value={form.description}
                onChange={update("description")}
                placeholder="Optional notes about this product"
                className="resize-none"
              />
            </section>

            {!isEdit && form.barcode.trim() && (
              <div className="rounded-md border bg-muted/30 p-2.5">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setShowLabel((v) => !v)}
                >
                  <span className="flex items-center gap-2 text-xs font-medium">
                    <QrIcon className="h-3.5 w-3.5" />
                    Label preview
                  </span>
                  <Badge variant="secondary">{showLabel ? "Hide" : "Show"}</Badge>
                </button>
                {showLabel && (
                  <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                    <ProductLabel data={labelData} />
                    <div className="flex flex-col gap-2">
                      <PrintLabelButton
                        data={labelData}
                        size="sm"
                        onError={(message) => toast.error(message)}
                      />
                      <PrintLabelButton
                        data={labelData}
                        copies={12}
                        variant="outline"
                        size="sm"
                        onError={(message) => toast.error(message)}
                      />
                      <DownloadQrButton
                        data={labelData}
                        onError={(message) => toast.error(message)}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Print one label, a sheet of 12, or download the QR as SVG.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {duplicateMessage && (
              <p className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                {duplicateMessage}
              </p>
            )}
          </div>

          <DialogFooter className="sticky -bottom-6 mt-1 border-t bg-background/95 px-0 pb-1 pt-3 backdrop-blur sm:-bottom-6 sm:px-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSave || pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {saved && (
        <LabelReadyDialog product={saved} onOpenChange={(next) => !next && setSaved(null)} />
      )}
    </>
  );
}

/** Offered right after a product is created so the label can be printed. */
function LabelReadyDialog({ product, onOpenChange }: { product: Product; onOpenChange: (open: boolean) => void }) {
  const data = {
    id: product.id,
    sku: product.sku,
    barcode: product.barcode ?? null,
    name: product.name,
    price: Number(product.sellingPrice),
    currency: product.currency,
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Product created</DialogTitle>
          <DialogDescription>
            {product.name} is ready. Print a shelf label, or close this to add another item.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          <ProductLabel data={data} />
          <div className="flex flex-wrap justify-center gap-2">
            <PrintLabelButton data={data} onError={(message) => toast.error(message)} />
            <PrintLabelButton
              data={data}
              copies={12}
              variant="outline"
              onError={(message) => toast.error(message)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Label value: <span className="font-mono">{product.barcode || product.sku}</span> ·{" "}
            {formatCurrency(Number(product.sellingPrice), product.currency)}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
