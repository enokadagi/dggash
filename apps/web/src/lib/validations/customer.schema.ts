import { z } from "zod";

export const createCustomerSchema = z.object({
  phone: z.string().min(1, "Phone is required").regex(/^\+[1-9]\d{1,14}$/, "Phone must be in E.164 format"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  password: z.string().min(6).optional(),
  secondaryPhone: z.string().optional().or(z.literal("")),
  whatsappNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, "WhatsApp number must be in E.164 format").optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  location: z.string().optional().or(z.literal("")),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  region: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  zone: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial().omit({ password: true });

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const customerQuerySchema = z.object({
  page: z.number().optional(),
  limit: z.number().optional(),
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING"]).optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  zone: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export type CustomerQueryInput = z.infer<typeof customerQuerySchema>;

export const createCustomerNoteSchema = z.object({
  content: z.string().min(1, "Note content is required").max(2000),
});

export type CreateCustomerNoteInput = z.infer<typeof createCustomerNoteSchema>;
