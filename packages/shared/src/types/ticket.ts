import type { User } from './user';

export interface Ticket {
  id: string;
  ticketNumber: string;
  customerId: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category?: string;
  assignedToId?: string;
  createdById?: string;
  resolvedAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketReply {
  id: string;
  ticketId: string;
  content: string;
  isInternal: boolean;
  attachments?: string[];
  createdAt: string;
}

export type TicketStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'RESOLVED'
  | 'CLOSED';

export type TicketPriority =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'URGENT';
