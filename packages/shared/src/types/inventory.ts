export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  description?: string;
  category: InventoryCategory;
  brand?: string;
  model?: string;
  unitPrice: number;
  quantity: number;
  minQuantity: number;
  warehouseId?: string;
  supplierId?: string;
  location?: string;
  serialNumbers?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  itemId: string;
  type: StockMovementType;
  quantity: number;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  reference?: string;
  notes?: string;
  userId?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Warehouse {
  id: string;
  name: string;
  address?: string;
  capacity?: number;
  managerId?: string;
  createdAt: string;
  updatedAt: string;
}

export type InventoryCategory =
  | 'ROUTER'
  | 'ANTENNA'
  | 'FIBER'
  | 'SWITCH'
  | 'SIM_CARD'
  | 'TOOL'
  | 'ACCESSORY'
  | 'CABLE'
  | 'OTHER';

export type StockMovementType =
  | 'IN'
  | 'OUT'
  | 'TRANSFER'
  | 'ADJUSTMENT';
