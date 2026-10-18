"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export type ManagedRole = "ADMIN" | "STAFF";
export type ManagedStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface ManagedUser {
  id: string;
  phone: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: ManagedRole;
  status: ManagedStatus;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ManagedUsersResponse {
  data: ManagedUser[];
  total: number;
  page: number;
  limit: number;
}

export interface ManagedUserQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: ManagedRole | "";
  status?: ManagedStatus | "";
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface CreateManagedUserInput {
  phone: string;
  email?: string;
  firstName: string;
  lastName: string;
  password: string;
  role: ManagedRole;
  status?: ManagedStatus;
}

export interface UpdateManagedUserInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: ManagedRole;
  status?: ManagedStatus;
}

export function useManagedUsers(query?: ManagedUserQuery) {
  return useQuery({
    queryKey: ["managed-users", query],
    queryFn: () =>
      api.get<ManagedUsersResponse>(
        "/users",
        query as Record<string, string | number | boolean | undefined>
      ),
  });
}

export function useCreateManagedUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateManagedUserInput) => api.post<ManagedUser>("/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      toast.success("Employee created successfully");
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to create employee");
    },
  });
}

export function useUpdateManagedUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateManagedUserInput }) =>
      api.patch<ManagedUser>(`/users/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      queryClient.invalidateQueries({ queryKey: ["managed-users", variables.id] });
      toast.success("Employee updated successfully");
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to update employee");
    },
  });
}

export function useDeleteManagedUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      toast.success("Employee deleted successfully");
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to delete employee");
    },
  });
}

export function useResetManagedUserPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post<{ message?: string }>(`/users/${id}/password`, { password }),
    onSuccess: () => {
      toast.success("Password updated successfully");
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to update password");
    },
  });
}
