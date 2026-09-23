import { z } from "zod";

export const createSubscriptionSchema = z.object({
  customerId: z.string().uuid("Invalid customer ID"),
  planId: z.string().uuid("Invalid plan ID"),
  status: z.enum(["ACTIVE", "SUSPENDED", "EXPIRED", "CANCELLED", "PENDING"]).optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  autoRenew: z.boolean().default(true),
  macAddress: z.string().optional().or(z.literal("")),
  ipAddress: z.string().optional().or(z.literal("")),
  username: z.string().optional().or(z.literal("")),
  password: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

export const updateSubscriptionSchema = createSubscriptionSchema.partial().omit({ customerId: true });

export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

export const subscriptionQuerySchema = z.object({
  page: z.number().optional(),
  limit: z.number().optional(),
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "EXPIRED", "CANCELLED", "PENDING"]).optional(),
  planId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export type SubscriptionQueryInput = z.infer<typeof subscriptionQuerySchema>;
