"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SubscriptionQueryInput, CreateSubscriptionInput, UpdateSubscriptionInput } from "@/lib/validations";
import { toast } from "sonner";

export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: string;
  startDate: string;
  expiryDate: string;
  macAddress?: string;
  ipAddress?: string;
  username?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  customer?: { id: string; firstName: string; lastName: string; phone: string };
  plan?: { id: string; name: string; speed: string; durationDays: number; price: number; currency: string };
}

export interface SubscriptionsResponse {
  data: Subscription[];
  total: number;
  page: number;
  limit: number;
}

export function useSubscriptions(query?: SubscriptionQueryInput) {
  return useQuery({
    queryKey: ["subscriptions", query],
    queryFn: () => api.get<SubscriptionsResponse>("/subscriptions", query as Record<string, string | number | boolean | undefined>),
  });
}

export function useSubscription(id: string) {
  return useQuery({
    queryKey: ["subscriptions", id],
    queryFn: () => api.get<Subscription>(`/subscriptions/${id}`),
    enabled: !!id,
  });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSubscriptionInput) => api.post<Subscription>("/subscriptions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success("Subscription created successfully");
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to create subscription");
    },
  });
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSubscriptionInput }) =>
      api.patch<Subscription>(`/subscriptions/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions", variables.id] });
      toast.success("Subscription updated successfully");
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to update subscription");
    },
  });
}

export function useSuspendSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post(`/subscriptions/${id}/suspend`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success("Subscription suspended");
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to suspend subscription");
    },
  });
}

export function useReactivateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post(`/subscriptions/${id}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success("Subscription reactivated");
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to reactivate subscription");
    },
  });
}
