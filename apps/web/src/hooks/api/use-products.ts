"use client";



import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import { toast } from "sonner";



export interface ProductCategory {

  id: string;

  name: string;

  description?: string | null;

}



export interface Product {

  id: string;

  name: string;

  sku: string;

  barcode?: string | null;

  description?: string | null;

  purchasePrice: number | string;

  sellingPrice: number | string;

  currency: string;

  currentStock: number;

  minStock: number;

  unit: string;

  isActive: boolean;

  category?: ProductCategory | null;

  createdAt: string;

  updatedAt: string;

}



export interface PaginatedProducts {

  data: Product[];

  total: number;

  page: number;

  limit: number;

  totalPages: number;

}



export interface Customer {

  id: string;

  firstName: string;

  lastName: string;

  phone: string;

  status?: string;

}



export function useProducts(query?: {

  page?: number;

  limit?: number;

  search?: string;

  categoryId?: string;

  lowStock?: string;

}) {

  return useQuery({

    queryKey: ["products", query],

    queryFn: () =>

      api.get<PaginatedProducts>(

        "/products",

        query as Record<string, string | number | boolean | undefined>

      ),

  });

}



export function useProductLookup(q: string) {

  return useQuery({

    queryKey: ["product", "lookup", q],

    queryFn: () => api.get<Product | null>(`/products/lookup?q=${encodeURIComponent(q)}`),

    enabled: q.trim().length > 0,

    retry: false,

  });

}



export function useInventorySummary() {

  return useQuery({

    queryKey: ["inventory", "summary"],

    queryFn: () =>

      api.get<{

        totalProducts: number;

        totalStock: number;

        totalValue: number;

        lowStock: number;

        outOfStock: number;

        categories: number;

      }>("/inventory/summary"),

  });

}



export function useRestockProduct() {

  const queryClient = useQueryClient();



  return useMutation({

    mutationFn: ({

      id,

      quantity,

      reference,

      notes,

    }: {

      id: string;

      quantity: number;

      reference?: string;

      notes?: string;

    }) =>

      api.post(`/products/${id}/movements`, {

        movementType: "PURCHASE",

        quantity,

        reference,

        notes,

      }),

    onSuccess: () => {

      queryClient.invalidateQueries({ queryKey: ["products"] });

      queryClient.invalidateQueries({ queryKey: ["inventory", "summary"] });

      queryClient.invalidateQueries({ queryKey: ["product", "lookup"] });

      toast.success("Stock added successfully");

    },

    onError: (error: { message?: string }) => {

      toast.error(error.message || "Failed to add stock");

    },

  });

}



export function useCustomerSearch(q: string) {

  return useQuery({

    queryKey: ["customers", "search", q],

    queryFn: () => api.get<Customer[]>(`/customers/search?q=${encodeURIComponent(q)}`),

    enabled: q.trim().length >= 2,

  });

}



export type InventoryCategory = ProductCategory;

export interface ProductInput {
  name: string;
  sku: string;
  barcode?: string | null;
  categoryId?: string;
  purchasePrice: number;
  sellingPrice: number;
  minStock?: number;
  unit?: string;
  description?: string | null;
  initialStock?: number;
}

export function useInventoryCategories(enabled = true) {
  return useQuery({
    queryKey: ['inventory', 'categories'],
    queryFn: () => api.get<InventoryCategory[]>('/inventory/categories'),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      api.post<InventoryCategory>('/inventory/categories', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'categories'] });
      toast.success("Category created");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create category");
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; description?: string } }) =>
      api.patch<InventoryCategory>(`/inventory/categories/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'categories'] });
      toast.success("Category updated");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update category");
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/inventory/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'categories'] });
      toast.success("Category deleted");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete category");
    },
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductInput) => api.post<Product>('/products', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['product', 'lookup'] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ProductInput> }) =>
      api.patch<Product>(`/products/${id}`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['product', 'lookup'] });
      queryClient.invalidateQueries({ queryKey: ['product', variables.id] });
    },
  });
}

export interface ProductImportRow {
  name?: string;
  sku?: string;
  barcode?: string;
  category?: string;
  purchasePrice?: string | number;
  sellingPrice?: string | number;
  currency?: string;
  initialStock?: string | number;
  minStock?: string | number;
  unit?: string;
  description?: string;
  isActive?: string | boolean;
}

export interface ProductImportResultRow {
  row: number;
  status: 'imported' | 'failed';
  id?: string;
  sku?: string | null;
  name?: string;
  error?: string;
}

export interface ProductImportResult {
  imported: number;
  failed: number;
  total: number;
  createdCategories: string[];
  results: ProductImportResultRow[];
}

export function useImportProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rows: ProductImportRow[]) =>
      api.post<ProductImportResult>('/products/import', { rows }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}


