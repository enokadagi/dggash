import type { CustomerProfile } from './customer';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  subscriptionId?: string;
  planId?: string;
  status: InvoiceStatus;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  currency: string;
  dueDate: string;
  paidAt?: string;
  notes?: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  createdAt: string;
}

export interface Payment {
  id: string;
  paymentNumber: string;
  customerId: string;
  invoiceId?: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference?: string;
  notes?: string;
  wishMoneyBalance?: number;
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type InvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'PAID'
  | 'PARTIAL'
  | 'OVERDUE'
  | 'CANCELLED';

export type PaymentMethod =
  | 'CASH'
  | 'WISH_MONEY'
  | 'BANK_TRANSFER'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'ONLINE'
  | 'MOBILE_PAYMENT';

export type PaymentStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REFUNDED';
