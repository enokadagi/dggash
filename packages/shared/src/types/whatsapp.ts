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
}

export type WhatsAppTemplateType =
  | 'WELCOME'
  | 'INSTALLATION_SCHEDULED'
  | 'INSTALLATION_COMPLETED'
  | 'PAYMENT_REMINDER'
  | 'SUBSCRIPTION_EXPIRING'
  | 'SUBSCRIPTION_EXPIRED'
  | 'PAYMENT_CONFIRMATION'
  | 'SERVICE_ACTIVATED'
  | 'SERVICE_SUSPENDED'
  | 'CUSTOM';
