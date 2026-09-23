export interface User {
  id: string;
  email?: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string;
  twoFactorEnabled: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type UserRole =
  | 'SUPER_ADMIN'
  | 'OWNER'
  | 'ADMINISTRATOR'
  | 'ACCOUNTANT'
  | 'TECHNICIAN'
  | 'SALES'
  | 'CUSTOMER_SUPPORT'
  | 'CUSTOMER';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING';
