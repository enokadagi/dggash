import type { UserRole } from '../types/user';
import { StatusColors, RoleLabels } from '../constants';

export function formatDate(
  date: string | Date,
  format: 'short' | 'long' | 'withTime' | 'iso' | 'timeOnly' = 'short'
): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const pad = (n: number) => n.toString().padStart(2, '0');

  switch (format) {
    case 'short':
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
    case 'long':
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: '2-digit',
      });
    case 'withTime':
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    case 'iso':
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    case 'timeOnly':
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    default:
      return d.toLocaleDateString();
  }
}

export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  decimals: number = 2
): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return `${amount.toFixed(decimals)} ${currency}`;
  }
}

export function formatPhone(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.charAt(0) ?? ''}${lastName?.charAt(0) ?? ''}`.toUpperCase();
}

export function getStatusColor(status: string): string {
  return StatusColors[status] ?? '#9ca3af';
}

export function getRoleLabel(role: UserRole): string {
  return RoleLabels[role] ?? role;
}

export function generateInvoiceNumber(sequence: number): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `INV-${year}${month}-${sequence.toString().padStart(5, '0')}`;
}

export function generatePaymentNumber(sequence: number): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `PAY-${year}${month}-${sequence.toString().padStart(5, '0')}`;
}

export function generateTicketNumber(sequence: number): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `TKT-${year}${month}-${sequence.toString().padStart(5, '0')}`;
}
