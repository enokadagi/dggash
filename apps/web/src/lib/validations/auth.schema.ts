import { z } from "zod";

const phonePattern = /^\+[1-9]\d{1,14}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const identifier = z
  .string()
  .min(1, "Phone or email is required")
  .max(254, "Identifier is too long")
  .refine((v) => phonePattern.test(v.trim()) || emailPattern.test(v.trim()), {
    message: "Enter a valid phone or email",
  });

export const loginSchema = z.object({
  identifier,
  phone: identifier.optional(),
  email: identifier.optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  rememberMe: z.boolean().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Confirm password is required"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const twoFactorSchema = z.object({
  code: z.string().length(6, "Code must be 6 digits").regex(/^\d+$/, "Code must be numeric"),
});

export type TwoFactorInput = z.infer<typeof twoFactorSchema>;
