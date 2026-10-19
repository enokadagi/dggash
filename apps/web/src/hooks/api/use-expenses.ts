"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export interface Expense {
  id: string;
  category: string;
  description?: string | null;
  amount: number | string;
  currency: string;
  paymentMethod?: string | null;
  incurredAt: string;
  userId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedExpenses {
  data: Expense[];
  total: number;
  page: number;
  limit: number;
  totalAmount: number;
}

export interface ExpenseInput {
  category: string;
  description?: string | null;
  amount: number;
  currency?: string;
  paymentMethod?: string | null;
  incurredAt?: string;
}

export function useExpenses(query?: {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: ["expenses", query],
    queryFn: () =>
      api.get<PaginatedExpenses>(
        "/expenses",
        query as Record<string, string | number | boolean | undefined>
      ),
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseInput) => api.post<Expense>("/expenses", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["reports", "profit"] });
      toast.success("Expense created");
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to create expense");
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ExpenseInput> }) =>
      api.patch<Expense>(`/expenses/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["reports", "profit"] });
      toast.success("Expense updated");
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to update expense");
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["reports", "profit"] });
      toast.success("Expense deleted");
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to delete expense");
    },
  });
}
