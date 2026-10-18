"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Package, Layers, DollarSign, AlertTriangle, PackageX, PackagePlus, Plus, Pencil, Printer, FileUp } from "lucide-react";
import { toast } from "sonner";
import { useProducts, useInventorySummary, useRestockProduct, type Product } from "@/hooks/api/use-products";
import { useLocalization } from "@/hooks/use-localization";
import { ProductFormDialog } from "@/components/inventory/product-form-dialog";
import { ImportProductsDialog } from "@/components/inventory/import-products-dialog";
import { PrintLabelButton, DownloadQrButton, ProductLabel } from "@/components/barcode/product-label";
import { usePagination } from "@/hooks/use-pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";

function StockBadge({ product }: { product: Product }) {
  const { t } = useLocalization();
  if (product.currentStock <= 0) {
    return <Badge variant="destructive">{t("inventoryPage.outOfStock")}</Badge>;
  }
  if (product.currentStock <= product.minStock) {
    return <Badge variant="warning">{t("inventoryPage.lowStock")}</Badge>;
  }
  return <Badge variant="success">{t("inventoryPage.inStock")}</Badge>;
}

function RestockDialog({
  product,
  onOpenChange,
}: {
  product: Product | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [quantity, setQuantity] = React.useState(1);
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const restockMutation = useRestockProduct();
  const { t } = useLocalization();

  React.useEffect(() => {
    if (product) {
      setQuantity(1);
      setReference("");
      setNotes("");
    }
  }, [product]);

  return (
    <Dialog open={!!product} onOpenChange={(open) => { if (!open) onOpenChange(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("inventoryPage.restockTitle", { product: product?.name })}</DialogTitle>
          <DialogDescription>
            {t("inventoryPage.currentStock", { quantity: product?.currentStock, unit: product?.unit })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="restock-qty" className="text-xs font-medium text-muted-foreground">
              {t("inventoryPage.quantity")}
            </Label>
            <Input
              id="restock-qty"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 0))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="restock-ref" className="text-xs font-medium text-muted-foreground">
              {t("inventoryPage.referenceOptional")}
            </Label>
            <Input
              id="restock-ref"
              placeholder={t("inventoryPage.referencePlaceholder")}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="restock-notes" className="text-xs font-medium text-muted-foreground">
              {t("inventoryPage.notesOptional")}
            </Label>
            <Textarea
              id="restock-notes"
              placeholder={t("inventoryPage.notesPlaceholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={restockMutation.isPending || quantity < 1}
            onClick={() => {
              restockMutation.mutate(
                {
                  id: product!.id,
                  quantity,
                  reference: reference.trim() || undefined,
                  notes: notes.trim() || undefined,
                },
                { onSuccess: () => onOpenChange(false) }
              );
            }}
          >
            {restockMutation.isPending ? t("inventoryPage.adding") : t("inventoryPage.addStock")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LabelDialog({
  product,
  onOpenChange,
}: {
  product: Product | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLocalization();

  if (!product) {
    return null;
  }

  const data = {
    id: product.id,
    sku: product.sku,
    barcode: product.barcode ?? null,
    name: product.name,
    price: Number(product.sellingPrice),
    currency: product.currency,
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onOpenChange(false); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("inventoryPage.printLabel")}</DialogTitle>
          <DialogDescription>
            {t("inventoryPage.labelDescription", { name: product.name })}
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
            <DownloadQrButton data={data} onError={(message) => toast.error(message)} />
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            {t("inventoryPage.qrHint")}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddProductDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return <ProductFormDialog open={open} onOpenChange={onOpenChange} />;
}

export default function InventoryPage() {
  const { t } = useLocalization();
  const { page, limit, setPage } = usePagination();
  const [search, setSearch] = React.useState("");
  const [lowStock, setLowStock] = React.useState("false");
  const [restockProduct, setRestockProduct] = React.useState<Product | null>(null);
  const [addProductOpen, setAddProductOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [editProduct, setEditProduct] = React.useState<Product | null>(null);
  const [labelProduct, setLabelProduct] = React.useState<Product | null>(null);
  const debouncedSearch = useDebounce(search);

  const { data, isLoading } = useProducts({
    page,
    limit,
    search: debouncedSearch || undefined,
    lowStock: lowStock === "true" ? "true" : undefined,
  });

  const { data: summary, isLoading: summaryLoading } = useInventorySummary();

  const products = data?.data || [];

  const columns: ColumnDef<Product>[] = [
    {
      accessorKey: "name",
      header: t("inventoryPage.product"),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="font-medium">{row.original.name}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {row.original.sku}
            {row.original.barcode ? ` · ${row.original.barcode}` : ""}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "category",
      header: t("inventoryPage.category"),
      cell: ({ row }) => row.original.category?.name || "—",
    },
    {
      accessorKey: "unit",
      header: t("inventoryPage.unit"),
      cell: ({ row }) => row.original.unit,
    },
    {
      accessorKey: "sellingPrice",
      header: t("inventoryPage.sellingPrice"),
      cell: ({ row }) => formatCurrency(Number(row.original.sellingPrice), row.original.currency),
    },
    {
      accessorKey: "currentStock",
      header: t("inventoryPage.stock"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-semibold tabular-nums">{row.original.currentStock}</span>
          <StockBadge product={row.original} />
        </div>
      ),
    },
    {
      accessorKey: "isActive",
      header: t("common.status"),
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "success" : "secondary"}>
          {row.original.isActive ? t("common.active") : t("common.inactive")}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("inventoryPage.title")}
        description={t("inventoryPage.description")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp className="me-2 h-4 w-4" />
              {t("inventoryPage.import.button")}
            </Button>
            <Button onClick={() => setAddProductOpen(true)}>
              <Plus className="me-2 h-4 w-4" />
              {t("inventoryPage.addProduct")}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t("inventoryPage.totalProducts")}
          value={summaryLoading ? "—" : (summary?.totalProducts ?? 0)}
          icon={Package}
        />
        <StatCard
          title={t("inventoryPage.stockValue")}
          value={summaryLoading ? "—" : formatCurrency(summary?.totalValue ?? 0)}
          icon={DollarSign}
        />
        <StatCard
          title={t("inventoryPage.unitsInStock")}
          value={summaryLoading ? "—" : (summary?.totalStock ?? 0)}
          icon={Layers}
        />
        <StatCard
          title={t("inventoryPage.lowStock")}
          value={summaryLoading ? "—" : (summary?.lowStock ?? 0)}
          icon={AlertTriangle}
          description={t("inventoryPage.outOfStockCount", { count: summary?.outOfStock ?? 0 })}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium">{t("inventoryPage.products")}</p>
              <p className="text-xs text-muted-foreground">
                {t("inventoryPage.productCount", { count: data?.total ?? 0 })}{isLoading ? "..." : ""}
              </p>
            </div>
            <div className="w-full sm:w-56">
              <Label htmlFor="stock-filter" className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("inventoryPage.stockLevel")}
              </Label>
              <Select value={lowStock} onValueChange={(v) => { setLowStock(v); setPage(1); }}>
                <SelectTrigger id="stock-filter" className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">{t("inventoryPage.allStock")}</SelectItem>
                  <SelectItem value="true">{t("inventoryPage.lowStockOnly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DataTable
            columns={columns}
            data={products}
            searchPlaceholder={t("inventoryPage.searchProducts")}
            onSearch={setSearch}
            page={page}
            totalPages={data ? Math.ceil(data.total / (data.limit || 1)) : 1}
            totalItems={data?.total}
            onPageChange={setPage}
            actions={(row) => [
              { label: t("inventoryPage.restock"), onClick: () => setRestockProduct(row), icon: <PackagePlus className="h-4 w-4" /> },
              { label: t("inventoryPage.label"), onClick: () => setLabelProduct(row), icon: <Printer className="h-4 w-4" /> },
              { label: t("common.edit"), onClick: () => setEditProduct(row), icon: <Pencil className="h-4 w-4" /> },
            ]}
          />
        </CardContent>
      </Card>

      <RestockDialog
        product={restockProduct}
        onOpenChange={(open) => { if (!open) setRestockProduct(null); }}
      />
      <AddProductDialog open={addProductOpen} onOpenChange={setAddProductOpen} />
      <ImportProductsDialog open={importOpen} onOpenChange={setImportOpen} />
      <ProductFormDialog
        open={Boolean(editProduct)}
        product={editProduct}
        onOpenChange={(open) => { if (!open) setEditProduct(null); }}
      />
      <LabelDialog
        product={labelProduct}
        onOpenChange={(open) => { if (!open) setLabelProduct(null); }}
      />

      {!isLoading && products.length === 0 && !search && lowStock === "true" && (
        <div className="flex items-start gap-2 rounded-md border p-4 text-sm text-muted-foreground">
          <PackageX className="mt-0.5 h-4 w-4" />
          <span>
            {t("inventoryPage.noRestockNeeded")}
          </span>
        </div>
      )}
    </div>
  );
}