"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PaginatedResponse } from "@/lib/api";
import type { CustomerQueryInput, CreateCustomerInput, UpdateCustomerInput } from "@/lib/validations";
import { toast } from "sonner";

export interface CustomerSubscription {
  id: string;
  planId: string;
  startDate: string;
  expiryDate: string;
  status: string;
  paymentStatus: string;
  plan?: { id: string; name: string };
}

export interface Customer {
  id: string;
  userId?: string;
  phone: string;
  whatsappNumber?: string;
  email?: string;
  firstName: string;
  lastName: string;
  status: string;
  area?: string;
  city?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  subscriptions?: CustomerSubscription[];
}

export interface CustomersResponse {
  data: Customer[];
  total: number;
  page: number;
  limit: number;
}

export function useCustomers(query?: CustomerQueryInput) {
  return useQuery({
    queryKey: ["customers", query],
    queryFn: () => api.get<CustomersResponse>("/customers", query as Record<string, string | number | boolean | undefined>),
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ["customers", id],
    queryFn: () => api.get<Customer>(`/customers/${id}`),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCustomerInput) => api.post<Customer>("/customers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer created successfully");
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to create customer");
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCustomerInput }) =>
      api.patch<Customer>(`/customers/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customers", variables.id] });
      toast.success("Customer updated successfully");
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to update customer");
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer deleted successfully");
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to delete customer");
    },
  });
}
