export interface NetworkDevice {
  id: string;
  name: string;
  vendor: NetworkVendor;
  model?: string;
  serialNumber?: string;
  ipAddress: string;
  macAddress?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  status: DeviceStatus;
  config?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  lastSeenAt?: string;
  firmwareVersion?: string;
  subscriptionId?: string;
  customerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DevicePort {
  id: string;
  deviceId: string;
  portNumber: number;
  name?: string;
  speed?: number;
  isActive: boolean;
  connectedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BandwidthLog {
  id: string;
  deviceId: string;
  uploadMbps: number;
  downloadMbps: number;
  timestamp: string;
}

export type NetworkVendor = 'MIKROTIK' | 'UBIQUITI' | 'CUSTOM';

export type DeviceStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'SUSPENDED'
  | 'MAINTENANCE';
