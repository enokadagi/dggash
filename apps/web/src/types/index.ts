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
  | "SUPER_ADMIN"
  | "OWNER"
  | "ADMINISTRATOR"
  | "ACCOUNTANT"
  | "TECHNICIAN"
  | "SALES"
  | "CUSTOMER_SUPPORT"
  | "CUSTOMER";

export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";

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
  notes?: string;
  documents?: unknown[];
  gpsLocation?: unknown;
  createdAt: string;
  updatedAt: string;
  user: User;
  subscriptions?: Subscription[];
  invoices?: Invoice[];
  payments?: Payment[];
  supportTickets?: Ticket[];
  installations?: Installation[];
  networkDevices?: NetworkDevice[];
  customerNotes?: CustomerNote[];
}

export interface CustomerNote {
  id: string;
  customerId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeProfile {
  id: string;
  userId: string;
  employeeId: string;
  department?: string;
  position?: string;
  hireDate: string;
  salary?: number;
  createdAt: string;
  updatedAt: string;
  user: User;
  attendances?: Attendance[];
  tasks?: Task[];
}

export interface TechnicianProfile {
  id: string;
  userId: string;
  technicianId: string;
  skills: string[];
  certification?: string;
  maxActiveJobs: number;
  currentLat?: number;
  currentLng?: number;
  lastLocationAt?: string;
  createdAt: string;
  updatedAt: string;
  user: User;
  installations?: Installation[];
}

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
  subscriptions?: Subscription[];
}

export type SubscriptionCycle = "MONTHLY" | "WEEKLY" | "YEARLY" | "CUSTOM";

export type SubscriptionStatus = "ACTIVE" | "SUSPENDED" | "EXPIRED" | "CANCELLED" | "PENDING";

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
  customer: CustomerProfile;
  plan: Plan;
  invoices?: Invoice[];
  networkDevices?: NetworkDevice[];
}

export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "PARTIAL" | "OVERDUE" | "CANCELLED";

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
  customer: CustomerProfile;
  subscription?: Subscription;
  plan?: Plan;
  payments?: Payment[];
  invoiceItems?: InvoiceItem[];
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

export type PaymentMethod = "CASH" | "WISH_MONEY" | "BANK_TRANSFER" | "CREDIT_CARD" | "DEBIT_CARD" | "ONLINE" | "MOBILE_PAYMENT";

export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";

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
  customer: CustomerProfile;
  invoice?: Invoice;
  recordedBy?: User;
}

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING" | "RESOLVED" | "CLOSED";

export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

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
  customer: CustomerProfile;
  assignee?: User;
  creator?: User;
  replies?: TicketReply[];
}

export interface TicketReply {
  id: string;
  ticketId: string;
  content: string;
  isInternal: boolean;
  attachments?: unknown[];
  createdAt: string;
}

export type InstallationStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";

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
  equipmentUsed?: unknown;
  notes?: string;
  signature?: string;
  photos?: unknown[];
  cost?: number;
  createdAt: string;
  updatedAt: string;
  customer: CustomerProfile;
  technician?: TechnicianProfile;
  timeEntries?: TimeEntry[];
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

export type NetworkVendor = "MIKROTIK" | "UBIQUITI" | "CUSTOM";

export type DeviceStatus = "ONLINE" | "OFFLINE" | "SUSPENDED" | "MAINTENANCE";

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
  config?: unknown;
  credentials?: unknown;
  lastSeenAt?: string;
  firmwareVersion?: string;
  createdAt: string;
  updatedAt: string;
  subscription?: Subscription;
  customer?: CustomerProfile;
  ports?: DevicePort[];
  bandwidthLogs?: BandwidthLog[];
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

export type WhatsAppTemplateType =
  | "WELCOME"
  | "INSTALLATION_SCHEDULED"
  | "INSTALLATION_COMPLETED"
  | "PAYMENT_REMINDER"
  | "SUBSCRIPTION_EXPIRING"
  | "SUBSCRIPTION_EXPIRED"
  | "PAYMENT_CONFIRMATION"
  | "SERVICE_ACTIVATED"
  | "SERVICE_SUSPENDED"
  | "CUSTOM";

export interface WhatsAppTemplate {
  id: string;
  name: string;
  type: WhatsAppTemplateType;
  subject?: string;
  body: string;
  variables: string[];
  isActive: boolean;
  language: string;
  createdAt: string;
  updatedAt: string;
  messageLogs?: WhatsAppMessage[];
}

export interface WhatsAppMessage {
  id: string;
  templateId?: string;
  recipientPhone: string;
  customerId?: string;
  body: string;
  status: string;
  externalId?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  errorMessage?: string;
  createdAt: string;
  template?: WhatsAppTemplate;
}

export type InventoryCategory = "ROUTER" | "ANTENNA" | "FIBER" | "SWITCH" | "SIM_CARD" | "TOOL" | "ACCESSORY" | "CABLE" | "OTHER";

export type StockMovementType = "IN" | "OUT" | "TRANSFER" | "ADJUSTMENT";

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
  inventoryItems?: InventoryItem[];
}

export interface Warehouse {
  id: string;
  name: string;
  address?: string;
  capacity?: number;
  managerId?: string;
  createdAt: string;
  updatedAt: string;
  inventoryItems?: InventoryItem[];
}

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
  serialNumbers?: unknown;
  createdAt: string;
  updatedAt: string;
  warehouse?: Warehouse;
  supplier?: Supplier;
  stockMovements?: StockMovement[];
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
  createdAt: string;
  item: InventoryItem;
  user?: User;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  assignedToId?: string;
  status: string;
  priority: string;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  assignee?: EmployeeProfile;
}

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: string;
  notes?: string;
  createdAt: string;
  employee: EmployeeProfile;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySetting {
  id: string;
  key: string;
  value: unknown;
  category: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType = "INFO" | "SUCCESS" | "WARNING" | "ERROR";

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  actionUrl?: string;
  createdAt: string;
}

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "EXPORT" | "IMPORT" | "APPROVE" | "REJECT";

export interface AuditLog {
  id: string;
  userId?: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  user?: User;
}

export interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  trigger: string;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>[];
  isActive: boolean;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
  executionLogs?: AutomationExecution[];
}

export interface AutomationExecution {
  id: string;
  ruleId: string;
  status: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  executedAt: string;
}

export interface Backup {
  id: string;
  filename: string;
  size?: number;
  status: string;
  type: string;
  storagePath: string;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}
