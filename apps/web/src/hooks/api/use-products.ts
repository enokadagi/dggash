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
