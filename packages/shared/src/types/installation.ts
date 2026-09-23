export interface Installation {
  id: string;
  customerId: string;
  technicianId?: string;
  status: InstallationStatus;
  scheduledDate?: string;
  completedDate?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  equipmentUsed?: Record<string, unknown>;
  notes?: string;
  signature?: string;
  photos?: string[];
  cost?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntry {
  id: string;
  technicianId: string;
  installationId?: string;
  startTime: string;
  endTime?: string;
  durationMinutes?: number;
  notes?: string;
  createdAt: string;
}

export type InstallationStatus =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';
