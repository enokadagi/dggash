"use client";

import * as React from "react";
import { Plus, Edit2, Trash2, FolderPlus, Tag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState, EmptyState } from "@/components/ui/status-states";
import {
  useInventoryCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  type InventoryCategory,
} from "@/hooks/api/use-products";

export function CategoryManager() {
  const { data: categories, isLoading, refetch } = useInventoryCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingCategory, setEditingCategory] = React.useState<InventoryCategory | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  const handleOpenCreate = () => {
    setEditingCategory(null);
    setName("");
    setDescription("");
    setDialogOpen(true);
  };

  const handleOpenEdit = (cat: InventoryCategory) => {
    setEditingCategory(cat);
    setName(cat.name);
    setDescription(cat.description || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    if (editingCategory) {
      await updateCategory.mutateAsync({
        id: editingCategory.id,
        input: { name: name.trim(), description: description.trim() || undefined },
      });
    } else {
      await createCategory.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
      });
    }
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteCategory.mutateAsync(deleteId);
    setDeleteId(null);
  };

  const pending = createCategory.isPending || updateCategory.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Inventory Categories
          </CardTitle>
          <CardDescription>
            Add, edit, or remove product categories for inventory organization
          </CardDescription>
        </div>
        <Button size="sm" onClick={handleOpenCreate}>
          <Plus className="me-1 h-4 w-4" />
          Add Category
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState message="Loading categories..." />
        ) : !categories || categories.length === 0 ? (
          <EmptyState
            message="No categories found. Create categories to organize your inventory products."
            actionLabel="Add Category"
            onAction={handleOpenCreate}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-start justify-between rounded-lg border p-3.5 transition-colors hover:bg-muted/30"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    <FolderPlus className="h-4 w-4 text-primary shrink-0" />
                    <span>{cat.name}</span>
                  </div>
                  {cat.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {cat.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => handleOpenEdit(cat)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteId(cat.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Dialog for Create / Edit */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? "Edit Category" : "New Category"}
              </DialogTitle>
              <DialogDescription>
                {editingCategory
                  ? "Update category details"
                  : "Enter a unique name and optional description for the new category"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="cat-name">Category Name</Label>
                <Input
                  id="cat-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Routers, Cables, Fiber"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-desc">Description</Label>
                <Textarea
                  id="cat-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional notes or details about this category"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!name.trim() || pending}>
                {pending ? "Saving..." : editingCategory ? "Save Changes" : "Create Category"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm Delete */}
        <ConfirmDialog
          open={Boolean(deleteId)}
          onOpenChange={(open) => !open && setDeleteId(null)}
          title="Delete Category"
          description="Are you sure you want to delete this category? This action cannot be undone."
          confirmLabel="Delete Category"
          destructive
          onConfirm={handleDelete}
        />
      </CardContent>
    </Card>
  );
}
