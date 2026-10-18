"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  quantity: number;
  unitPrice: number | string;
  totalPrice: number | string;
  /** Present on enriched responses (list/detail/create). */
  costPrice?: number | string;
  lineCost?: number | string;
  lineProfit?: number | string;
  product?: { id: string; name: string; sku: string; barcode?: string | null; unit?: string | null };
}

export interface SaleCustomer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export interface SaleUser {
  id: string;
  firstName: string;
  lastName: string;
}

export interface Sale {
  id: string;
  saleNumber: string;
  customerId?: string | null;
  userId?: string | null;
  totalAmount: number | string;
  currency: string;
  paymentMethod: string;
  status: "COMPLETED" | "REFUNDED" | "CANCELLED";
  notes?: string | null;
  /** Estimated cost (from product purchasePrice) and resulting profit. */
  cost?: number | string;
  profit?: number | string;
  customer?: SaleCustomer | null;
  user?: SaleUser | null;
  items: SaleItem[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedSales {
  data: Sale[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateSaleInput {
  items: Array<{ productId: string; quantity: number }>;
  customerId?: string;
  paymentMethod: string;
  currency?: string;
  notes?: string;
}

export interface SaleReceipt {
  saleNumber: string;
  totalAmount: number;
  currency: string;
  paymentMethod: string;
  items: number;
  soldAt: string;
}

export interface CreateSaleResponse {
  sale: Sale;
  receipt: SaleReceipt;
}

export function useSales(query?: {
  page?: number;
  limit?: number;
  status?: string;
  paymentMethod?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ["sales", query],
    queryFn: () =>
      api.get<PaginatedSales>(
        "/sales",
        query as Record<string, string | number | boolean | undefined>
      ),
  });
}

export function useSale(id: string) {
  return useQuery({
    queryKey: ["sale", id],
    queryFn: () => api.get<Sale>(`/sales/${id}`),
    enabled: !!id,
  });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSaleInput) => api.post<CreateSaleResponse>("/sales", data),
    onSuccess: (resp) => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(`Sale ${resp.receipt.saleNumber} completed — $${resp.receipt.totalAmount}`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Sale failed");
    },
  });
}

export function useRefundSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post<Sale>(`/sales/${id}/refund`, { reason }),
    onSuccess: (sale) => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["sale", sale.id] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(`Sale ${sale.saleNumber} refunded`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Refund failed");
    },
  });
}

export function useCancelSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post<Sale>(`/sales/${id}/cancel`, { reason }),
    onSuccess: (sale) => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["sale", sale.id] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(`Sale ${sale.saleNumber} cancelled`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Cancel failed");
    },
  });
}
