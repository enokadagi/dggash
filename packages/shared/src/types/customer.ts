import type { User } from './user';
import type { Subscription } from './subscription';
import type { Invoice } from './billing';
import type { Ticket } from './ticket';
import type { Installation } from './installation';
import type { NetworkDevice } from './network';

export interface CustomerProfile {
  id: string;
  userId: string;
  secondaryPhone?: string;
  whatsappNumber?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  region?: string;
  city?: string;
  zone?: string;
  notes?: string | CustomerNote[];
  documents?: string[];
  gpsLocation?: { lat: number; lng: number };
  createdAt: string;
  updatedAt: string;
}

export interface CustomerNote {
  id: string;
  customerId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerWithRelations extends Omit<CustomerProfile, 'notes'> {
  user: User;
  subscriptions?: Subscription[];
  invoices?: Invoice[];
  tickets?: Ticket[];
  installations?: Installation[];
  networkDevices?: NetworkDevice[];
  notes?: CustomerNote[];
}
