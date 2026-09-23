import type { CustomerProfile } from './customer';

export interface Plan {
  id: string;
  name: string;
  description?: string;
  speedDown: number;
  speedUp: number;
  price: number;
  currency: string;
  cycle: SubscriptionCycle;
  isActive: boolean;
  isUnlimited: boolean;
  dataLimit?: number;
  taxRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate?: string;
  nextBillingDate?: string;
  autoRenew: boolean;
  macAddress?: string;
  ipAddress?: string;
  username?: string;
  password?: string;
  notes?: string;
  suspendedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionWithRelations extends Subscription {
  customer?: CustomerProfile;
  plan?: Plan;
}

export type SubscriptionStatus =
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'PENDING';

export type SubscriptionCycle =
  | 'MONTHLY'
  | 'WEEKLY'
  | 'YEARLY'
  | 'CUSTOM';
