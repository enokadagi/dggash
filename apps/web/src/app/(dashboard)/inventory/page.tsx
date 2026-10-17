"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Package, Layers, DollarSign, AlertTriangle, PackageX, PackagePlus, Plus, Pencil, Printer } from "lucide-react";
import { toast } from "sonner";
import { useProducts, useInventorySummary, useRestockProduct, type Product } from "@/hooks/api/use-products";
import { ProductFormDialog } from "@/components/inventory/product-form-dialog";
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
  if (product.currentStock <= 0) {
    return <Badge variant="destructive">Out of Stock</Badge>;
  }
  if (product.currentStock <= product.minStock) {
    return <Badge variant="warning">Low Stock</Badge>;
  }
  return <Badge variant="success">In Stock</Badge>;
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
          <DialogTitle>Restock {product?.name}</DialogTitle>
          <DialogDescription>
            Current stock: {product?.currentStock} {product?.unit}. Add stock to this product.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="restock-qty" className="text-xs font-medium text-muted-foreground">
              Quantity
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
              Reference (optional)
            </Label>
            <Input
              id="restock-ref"
              placeholder="e.g. Supplier PO-1024"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="restock-notes" className="text-xs font-medium text-muted-foreground">
              Notes (optional)
            </Label>
            <Textarea
              id="restock-notes"
              placeholder="e.g. New delivery from supplier"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
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
            {restockMutation.isPending ? "Adding..." : "Add Stock"}
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
          <DialogTitle>Print label</DialogTitle>
          <DialogDescription>
            Shelf label for {product.name}. Choose “Save as PDF” in the print dialog to download.
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
            Scanning the QR or barcode at the point of sale adds this product to the cart
            instantly.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
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
  const { page, limit, setPage } = usePagination();
  const [search, setSearch] = React.useState("");
  const [lowStock, setLowStock] = React.useState("false");
  const [restockProduct, setRestockProduct] = React.useState<Product | null>(null);
  const [addProductOpen, setAddProductOpen] = React.useState(false);
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
      header: "Product",
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
      header: "Category",
      cell: ({ row }) => row.original.category?.name || "—",
    },
    {
      accessorKey: "unit",
      header: "Unit",
      cell: ({ row }) => row.original.unit,
    },
    {
      accessorKey: "sellingPrice",
      header: "Selling Price",
      cell: ({ row }) => formatCurrency(Number(row.original.sellingPrice), row.original.currency),
    },
    {
      accessorKey: "currentStock",
      header: "Stock",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-semibold tabular-nums">{row.original.currentStock}</span>
          <StockBadge product={row.original} />
        </div>
      ),
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "success" : "secondary"}>
          {row.original.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Track products, stock levels, and value"
        actions={<Button onClick={() => setAddProductOpen(true)}><Plus className="me-2 h-4 w-4" />Add Product</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Products"
          value={summaryLoading ? "—" : (summary?.totalProducts ?? 0)}
          icon={Package}
        />
        <StatCard
          title="Stock Value"
          value={summaryLoading ? "—" : formatCurrency(summary?.totalValue ?? 0)}
          icon={DollarSign}
        />
        <StatCard
          title="Units in Stock"
          value={summaryLoading ? "—" : (summary?.totalStock ?? 0)}
          icon={Layers}
        />
        <StatCard
          title="Low Stock"
          value={summaryLoading ? "—" : (summary?.lowStock ?? 0)}
          icon={AlertTriangle}
          description={`${summary?.outOfStock ?? 0} out of stock`}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium">Products</p>
              <p className="text-xs text-muted-foreground">
                {data?.total ?? 0} products{isLoading ? "..." : ""}
              </p>
            </div>
            <div className="w-full sm:w-56">
              <Label htmlFor="stock-filter" className="mb-1 block text-xs font-medium text-muted-foreground">
                Stock level
              </Label>
              <Select value={lowStock} onValueChange={(v) => { setLowStock(v); setPage(1); }}>
                <SelectTrigger id="stock-filter" className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">All stock</SelectItem>
                  <SelectItem value="true">Low stock only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DataTable
            columns={columns}
            data={products}
            searchPlaceholder="Search products..."
            onSearch={setSearch}
            page={page}
            totalPages={data ? Math.ceil(data.total / (data.limit || 1)) : 1}
            totalItems={data?.total}
            onPageChange={setPage}
            actions={(row) => [
              { label: "Restock", onClick: () => setRestockProduct(row), icon: <PackagePlus className="h-4 w-4" /> },
              { label: "Label", onClick: () => setLabelProduct(row), icon: <Printer className="h-4 w-4" /> },
              { label: "Edit", onClick: () => setEditProduct(row), icon: <Pencil className="h-4 w-4" /> },
            ]}
          />
        </CardContent>
      </Card>

      <RestockDialog
        product={restockProduct}
        onOpenChange={(open) => { if (!open) setRestockProduct(null); }}
      />
      <AddProductDialog open={addProductOpen} onOpenChange={setAddProductOpen} />
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
            No products need restocking right now. Keep an eye on the Low Stock card —
            it updates automatically as sales happen.
          </span>
        </div>
      )}
    </div>
  );
}