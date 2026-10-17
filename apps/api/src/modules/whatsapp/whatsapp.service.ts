import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { WhatsAppReminderType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WhatsAppCloudApiService } from './whatsapp-cloud-api.service';
import { TemplateEngine } from './templates/template-engine';
import { SaveWhatsAppTemplateDto } from './dto/save-whatsapp-template.dto';

const REMINDER_CONFIG: Record<
  WhatsAppReminderType,
  { offsetKey: string; enabledKey: string; templateKey: string }
> = {
  DAYS_5: { offsetKey: 'reminder.offset_5d', enabledKey: 'reminder.enabled_5d', templateKey: 'whatsapp.reminder_5d_template' },
  DAYS_3: { offsetKey: 'reminder.offset_3d', enabledKey: 'reminder.enabled_3d', templateKey: 'whatsapp.reminder_3d_template' },
  DAYS_1: { offsetKey: 'reminder.offset_1d', enabledKey: 'reminder.enabled_1d', templateKey: 'whatsapp.reminder_1d_template' },
  EXPIRY_DAY: { offsetKey: 'reminder.offset_expiry', enabledKey: 'reminder.enabled_expiry', templateKey: 'whatsapp.reminder_expiry_template' },
};

export interface SendMessageResult {
  messageId: string;
  status: string;
  sentImmediately: boolean;
  result?: { success: boolean; error?: string };
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudApi: WhatsAppCloudApiService,
    private readonly auditService: AuditService,
  ) {}

  isConfigured(): boolean {
    return this.cloudApi.isConfigured();
  }

  async testConnection() {
    return this.cloudApi.testConnection();
  }

  async getStatusDetails() {
    const conf = await this.cloudApi.getActiveConfig();
    const configured = !!(conf.phoneNumberId && conf.accessToken);
    const settings = await this.prisma.companySetting.findMany({
      where: {
        key: {
          in: [
            'whatsapp.phoneNumberId',
            'whatsapp.businessAccountId',
            'whatsapp.webhookVerifyToken',
            'reminder.enabled_5d',
            'reminder.enabled_3d',
            'reminder.enabled_1d',
            'reminder.enabled_expiry',
            'reminder.offset_5d',
            'reminder.offset_3d',
            'reminder.offset_1d',
          ],
        },
      },
    });
    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    return {
      configured,
      phoneNumberId: conf.phoneNumberId || settingsMap['whatsapp.phoneNumberId'] || '',
      hasToken: !!conf.accessToken,
      businessAccountId: settingsMap['whatsapp.businessAccountId'] || '',
      webhookVerifyToken: settingsMap['whatsapp.webhookVerifyToken'] || 'awiknet-webhook-secret',
      reminders: {
        enabled5d: settingsMap['reminder.enabled_5d'] !== 'false',
        enabled3d: settingsMap['reminder.enabled_3d'] !== 'false',
        enabled1d: settingsMap['reminder.enabled_1d'] !== 'false',
        enabledExpiry: settingsMap['reminder.enabled_expiry'] !== 'false',
        offset5d: settingsMap['reminder.offset_5d'] || '5',
        offset3d: settingsMap['reminder.offset_3d'] || '3',
        offset1d: settingsMap['reminder.offset_1d'] || '1',
      },
    };
  }

  private getReminderConfig(type: WhatsAppReminderType) {
    return REMINDER_CONFIG[type];
  }

  private async getSettings(): Promise<Map<string, string>> {
    const settings = await this.prisma.companySetting.findMany();
    return new Map(settings.map((s) => [s.key, s.value]));
  }

  private async getSetting(key: string, fallback: string): Promise<string> {
    const settings = await this.prisma.companySetting.findUnique({ where: { key } });
    return settings ? settings.value : fallback;
  }

  async getReminderOffsets(): Promise<Record<WhatsAppReminderType, number>> {
    const [o5, o3, o1] = await Promise.all([
      this.getSetting('reminder.offset_5d', '5'),
      this.getSetting('reminder.offset_3d', '3'),
      this.getSetting('reminder.offset_1d', '1'),
    ]);
    return {
      DAYS_5: this.parseIntSetting(o5, 5),
      DAYS_3: this.parseIntSetting(o3, 3),
      DAYS_1: this.parseIntSetting(o1, 1),
      EXPIRY_DAY: 0,
    };
  }

  async getReminderEnabledState(): Promise<Record<WhatsAppReminderType, boolean>> {
    const [e5, e3, e1, eexp] = await Promise.all([
      this.getSetting('reminder.enabled_5d', 'true'),
      this.getSetting('reminder.enabled_3d', 'true'),
      this.getSetting('reminder.enabled_1d', 'true'),
      this.getSetting('reminder.enabled_expiry', 'true'),
    ]);
    return {
      DAYS_5: e5 === 'true',
      DAYS_3: e3 === 'true',
      DAYS_1: e1 === 'true',
      EXPIRY_DAY: eexp === 'true',
    };
  }

  private parseIntSetting(value: string, fallback: number): number {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : Math.max(0, parsed);
  }

  // ─── Manual / bulk messaging ───────────────────────────

  async sendMessage(dto: {
    recipientPhone: string;
    body: string;
    customerId?: string;
    scheduledFor?: string;
  }): Promise<SendMessageResult> {
    const scheduled = dto.scheduledFor ? new Date(dto.scheduledFor) : null;
    if (scheduled && scheduled.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledFor must be in the future');
    }

    return this.createAndSend({
      recipientPhone: dto.recipientPhone,
      customerId: dto.customerId || null,
      messageBody: dto.body,
      templateType: 'manual',
      scheduledFor: scheduled,
    });
  }

  async sendTemplateMessage(dto: {
    customerId?: string;
    phone?: string;
    templateKey: string;
    variables?: Record<string, string>;
  }): Promise<SendMessageResult> {
    let customer: any = null;
    if (dto.customerId) {
      customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, deletedAt: null },
      });
      if (!customer) throw new NotFoundException('Customer not found');
    }

    const recipientPhone =
      dto.phone || customer?.whatsappNumber || customer?.phone;
    if (!recipientPhone) throw new BadRequestException('No recipient phone provided');

    const template = await this.prisma.companySetting.findUnique({ where: { key: dto.templateKey } });
    if (!template) {
      throw new NotFoundException(`Template setting "${dto.templateKey}" not found. Add it in Settings -> WhatsApp.`);
    }

    const overrides = { ...(dto.variables || {}) };
    if (customer) {
      const activeSub = await this.prisma.subscription.findFirst({
        where: {
          customerId: customer.id,
          deletedAt: null,
          status: 'ACTIVE',
          expiryDate: { gte: new Date() },
        },
        orderBy: { expiryDate: 'desc' },
        include: { plan: true },
      });
      if (activeSub?.plan) {
        if (!overrides.plan_name && !overrides.planName) {
          overrides.plan_name = activeSub.plan.name;
          overrides.planName = activeSub.plan.name;
        }
        if (!overrides.price) {
          overrides.price = `${activeSub.plan.currency} ${activeSub.plan.price}`;
        }
        if (!overrides.expiry_date && !overrides.expiryDate) {
          overrides.expiry_date = this.prettyDate(activeSub.expiryDate);
          overrides.expiryDate = this.prettyDate(activeSub.expiryDate);
        }
        if (!overrides.days_remaining && !overrides.daysRemaining) {
          overrides.days_remaining = this.daysUntil(activeSub.expiryDate).toString();
          overrides.daysRemaining = overrides.days_remaining;
        }
      }
    }

    const variables = await this.buildVariables(customer, overrides);
    const messageBody = TemplateEngine.render(template.value, variables);

    return this.createAndSend({
      recipientPhone,
      customerId: customer?.id || null,
      messageBody,
      templateType: dto.templateKey,
      referenceId: customer?.id || null,
    });
  }

  async bulkSend(dto: {
    recipients: Array<{ phone: string; customerId?: string; variables?: Record<string, string> }>;
    templateKey?: string;
    body?: string;
  }) {
    if (dto.templateKey && dto.body) {
      throw new BadRequestException('Provide either a templateKey or a body, not both');
    }
    if (!dto.templateKey && !dto.body) {
      throw new BadRequestException('Provide either a templateKey or a body');
    }

    let template: any = null;
    if (dto.templateKey) {
      template = await this.prisma.companySetting.findUnique({ where: { key: dto.templateKey } });
      if (!template) throw new NotFoundException(`Template setting "${dto.templateKey}" not found`);
    }

    const enqueued = [];
    const failed = [];

    for (const recipient of dto.recipients) {
      try {
        let body = dto.body || template!.value;
        if (template) {
          body = TemplateEngine.render(template.value, {
            customer_name: '',
            plan_name: '',
            price: '',
            expiry_date: '',
            days_remaining: '',
            company_name: await this.getSetting('company.name', 'AWIK NET'),
            phone: await this.getSetting('company.phone', ''),
            ...(recipient.variables || {}),
          });
        }

        const result = await this.createAndSend({
          recipientPhone: recipient.phone,
          customerId: recipient.customerId || null,
          messageBody: body,
          templateType: dto.templateKey || 'manual',
        });
        enqueued.push(result);
      } catch (error) {
        failed.push({ phone: recipient.phone, error: (error as Error).message });
      }
    }

    return { enqueued: enqueued.length, failed, messages: enqueued };
  }

  // ─── Reminder scheduling ───────────────────────────────

  async getSubscriptionsDueForReminder(): Promise<Array<{ subscription: any; type: WhatsAppReminderType }>> {
    const offsets = await this.getReminderOffsets();
    const enabled = await this.getReminderEnabledState();
    const todayStr = this.beirutDateString(new Date());
    const soon = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
    const soonStr = this.beirutDateString(soon);

    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['SUSPENDED', 'EXPIRED'] },
        expiryDate: { gte: new Date(`${todayStr}T00:00:00Z`) },
      },
      include: {
        customer: true,
        plan: true,
      },
    });

    const due: Array<{ subscription: any; type: WhatsAppReminderType }> = [];
    for (const sub of subscriptions) {
      const expiryStr = this.beirutDateString(sub.expiryDate);
      if (expiryStr > soonStr) continue;

      for (const type of Object.keys(REMINDER_CONFIG) as WhatsAppReminderType[]) {
        if (!enabled[type]) continue;
        const offset = offsets[type];
        const scheduled = new Date(sub.expiryDate.getTime() - offset * 24 * 60 * 60 * 1000);
        const scheduledStr = this.beirutDateString(scheduled);
        if (scheduledStr === todayStr && sub.customer.phone) {
          due.push({ subscription: sub, type });
        }
      }
    }

    return due;
  }

  async sendReminder(subscriptionId: string, type: WhatsAppReminderType, actorId?: string) {
    const config = this.getReminderConfig(type);

    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { customer: true, plan: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');

    const offset = await this.getSetting(config.offsetKey, type === 'DAYS_5' ? '5' : type === 'DAYS_3' ? '3' : type === 'DAYS_1' ? '1' : '0');
    const scheduledFor = new Date(subscription.expiryDate.getTime() - this.parseIntSetting(offset, 0) * 24 * 60 * 60 * 1000);

    let reminder = await this.prisma.whatsAppReminder.findUnique({
      where: { subscriptionId_reminderType: { subscriptionId, reminderType: type } },
    });

    if (reminder && ['sent', 'skipped', 'pending'].includes(reminder.status)) return reminder;

    const template = await this.prisma.companySetting.findUnique({ where: { key: config.templateKey } });
    const variables = await this.buildVariables(subscription.customer, {
      plan_name: subscription.plan.name,
      price: `${subscription.plan.currency} ${subscription.plan.price}`,
      expiry_date: this.prettyDate(subscription.expiryDate),
      days_remaining: this.daysUntil(subscription.expiryDate).toString(),
    });

    const messageBody = template ? TemplateEngine.render(template.value, variables) : '(No WhatsApp template configured)';

    const recipientPhone = subscription.customer.whatsappNumber || subscription.customer.phone;

    const message = await this.createAndSend({
      recipientPhone,
      customerId: subscription.customerId,
      messageBody,
      templateType: config.templateKey,
      referenceId: subscriptionId,
    });

    const reminderStatus = message.status;
    reminder = await this.prisma.whatsAppReminder.upsert({
      where: { subscriptionId_reminderType: { subscriptionId, reminderType: type } },
      create: {
        subscriptionId,
        customerId: subscription.customerId,
        reminderType: type,
        scheduledFor,
        status: reminderStatus,
        sentAt: reminderStatus === 'sent' ? new Date() : null,
        errorMessage: reminderStatus === 'failed' ? message.result?.error || null : null,
      },
      update: {
        status: reminderStatus,
        sentAt: reminderStatus === 'sent' ? new Date() : null,
        errorMessage: reminderStatus === 'failed' ? message.result?.error || null : null,
      },
    });

    if (actorId) {
      await this.auditService.log({
        userId: actorId,
        action: 'CREATE',
        entity: 'WhatsAppReminder',
        entityId: reminder.id,
        newValues: { type, subscriptionId, status: reminderStatus },
      });
    }

    return reminder;
  }

  async getDueReminders() {
    const due = await this.getSubscriptionsDueForReminder();
    return due;
  }

  // ─── Message log & stats ───────────────────────────────

  async getMessages(query: any) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = query.customerId;
    if (query.search) {
      where.recipientPhone = { contains: query.search };
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    const data = await this.prisma.whatsAppMessage.findMany({
      where,
      include: { customer: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const total = await this.prisma.whatsAppMessage.count({ where });

    return { data, total, page, limit };
  }

  async getTemplates(query: { page?: string | number; limit?: string | number; search?: string }) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);

    const where: any = { key: { startsWith: 'whatsapp.' } };
    if (query.search) {
      where.key = { startsWith: 'whatsapp.', contains: query.search, mode: 'insensitive' };
    }

    const [total, rows] = await Promise.all([
      this.prisma.companySetting.count({ where }),
      this.prisma.companySetting.findMany({
        where,
        orderBy: { key: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const data = rows.map((s) => ({
      id: s.id,
      name: s.key.replace(/^whatsapp\./, ''),
      key: s.key,
      type: s.key.startsWith('whatsapp.reminder') ? 'reminder' : 'general',
      body: s.value,
      variables: TemplateEngine.extractVariables(s.value),
      isActive: !!s.value,
      language: 'en',
      description: s.description,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    return { data, total, page, limit };
  }

  async saveTemplate(dto: SaveWhatsAppTemplateDto) {
    const slug = dto.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '');
    if (!slug) throw new BadRequestException('Template name must include letters or numbers');
    const key = dto.key || `whatsapp.${slug}`;

    const existing = await this.prisma.companySetting.findUnique({ where: { key } });
    if (existing) {
      return this.prisma.companySetting.update({
        where: { key },
        data: {
          value: dto.body,
          ...(dto.description !== undefined && { description: dto.description }),
        },
      });
    }

    return this.prisma.companySetting.create({
      data: {
        key,
        value: dto.body,
        description: dto.description || null,
      },
    });
  }

  async getReminders(query: any) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.reminderType) where.reminderType = query.reminderType;

    const data = await this.prisma.whatsAppReminder.findMany({
      where,
      include: {
        subscription: {
          include: { customer: { select: { id: true, firstName: true, lastName: true, phone: true } }, plan: { select: { id: true, name: true } } },
        },
      },
      orderBy: { scheduledFor: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const total = await this.prisma.whatsAppReminder.count({ where });

    return { data, total, page, limit };
  }

  async getDeliveryStatus(id: string) {
    const message = await this.prisma.whatsAppMessage.findUnique({
      where: { id },
      include: { customer: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!message) throw new NotFoundException('Message not found');

    return {
      id: message.id,
      status: message.status,
      recipientPhone: message.recipientPhone,
      externalMessageId: message.externalMessageId,
      errorMessage: message.errorMessage,
      retryCount: message.retryCount,
      sentAt: message.sentAt,
      deliveredAt: message.deliveredAt,
      readAt: message.readAt,
    };
  }

  async retryMessage(id: string) {
    const message = await this.prisma.whatsAppMessage.findUnique({ where: { id } });
    if (!message) throw new NotFoundException('Message not found');
    if (message.status !== 'failed') {
      throw new BadRequestException('Only failed messages can be retried');
    }

    const result = await this.cloudApi.sendTextMessage(message.recipientPhone, message.messageBody);
    const status = result.success ? 'sent' : 'failed';

    const updated = await this.prisma.whatsAppMessage.update({
      where: { id },
      data: {
        status,
        externalMessageId: result.messageId || null,
        sentAt: result.success ? new Date() : null,
        deliveredAt: null,
        readAt: null,
        retryCount: { increment: 1 },
        errorMessage: result.success ? null : result.error,
      },
    });

    return updated;
  }

  async getStats() {
    const byStatus = await this.prisma.whatsAppMessage.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [totalSent, totalFailed, pendingNow, sentThisMonth] = await Promise.all([
      this.prisma.whatsAppMessage.count({ where: { status: { in: ['sent', 'delivered', 'read'] } } }),
      this.prisma.whatsAppMessage.count({ where: { status: 'failed' } }),
      this.prisma.whatsAppMessage.count({ where: { status: 'pending' } }),
      this.prisma.whatsAppMessage.count({ where: { status: { in: ['sent', 'delivered', 'read'] }, createdAt: { gte: monthStart } } }),
    ]);

    const statusMap = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));

    return {
      byStatus: statusMap,
      totalSent,
      totalFailed,
      pendingNow,
      sentThisMonth,
      configured: this.cloudApi.isConfigured(),
      deliveryRate: totalSent + totalFailed === 0 ? null : +(totalSent / (totalSent + totalFailed)).toFixed(3),
    };
  }

  async handleWebhookStatusUpdate(externalId: string, status: string, timestamp?: string, errorMessage?: string) {
    const message = await this.prisma.whatsAppMessage.findFirst({
      where: { externalMessageId: externalId },
    });
    if (!message) return;

    const updateData: any = {};
    switch (status) {
      case 'sent':
        updateData.status = 'sent';
        updateData.sentAt = timestamp ? new Date(Number(timestamp) * 1000) : new Date();
        break;
      case 'delivered':
        updateData.status = 'delivered';
        updateData.deliveredAt = timestamp ? new Date(Number(timestamp) * 1000) : new Date();
        updateData.sentAt = message.sentAt || new Date();
        break;
      case 'read':
        updateData.status = 'read';
        updateData.readAt = timestamp ? new Date(Number(timestamp) * 1000) : new Date();
        break;
      case 'failed':
        updateData.status = 'failed';
        updateData.errorMessage = errorMessage || 'Delivery failure reported by WhatsApp';
        break;
      default:
        return;
    }

    await this.prisma.whatsAppMessage.update({ where: { id: message.id }, data: updateData });
  }

  // ─── Internal helpers ──────────────────────────────────

  private async createAndSend(params: {
    recipientPhone: string;
    customerId: string | null;
    messageBody: string;
    templateType?: string;
    referenceId?: string | null;
    scheduledFor?: Date | null;
  }): Promise<SendMessageResult> {
    const record = await this.prisma.whatsAppMessage.create({
      data: {
        recipientPhone: params.recipientPhone,
        customerId: params.customerId,
        messageBody: params.messageBody,
        status: 'pending',
        templateType: params.templateType || null,
        referenceId: params.referenceId || null,
        scheduledFor: params.scheduledFor || null,
      },
    });

    if (params.scheduledFor) {
      return { messageId: record.id, status: 'pending', sentImmediately: false };
    }

    if (!this.cloudApi.isConfigured()) {
      this.logger.warn(
        'WhatsApp API is not configured. Message queued as pending (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_API_TOKEN missing).',
      );
      return { messageId: record.id, status: 'pending', sentImmediately: false };
    }

    const result = await this.cloudApi.sendTextMessage(params.recipientPhone, params.messageBody);
    if (result.success) {
      await this.prisma.whatsAppMessage.update({
        where: { id: record.id },
        data: {
          status: 'sent',
          externalMessageId: result.messageId,
          sentAt: new Date(),
          errorMessage: null,
        },
      });
      return { messageId: record.id, status: 'sent', sentImmediately: true, result };
    }

    await this.prisma.whatsAppMessage.update({
      where: { id: record.id },
      data: { status: 'failed', retryCount: 1, errorMessage: result.error },
    });
    return { messageId: record.id, status: 'failed', sentImmediately: true, result };
  }

  private async buildVariables(
    customer: any,
    overrides?: Record<string, string>,
  ): Promise<Record<string, string>> {
    const [companyName, companyPhone] = await Promise.all([
      this.getSetting('company.name', 'AWIK NET'),
      this.getSetting('company.phone', ''),
    ]);

    return {
      customer_name: customer
        ? `${customer.firstName} ${customer.lastName}`.trim()
        : '',
      plan_name: '',
      price: '',
      expiry_date: '',
      days_remaining: '',
      company_name: companyName,
      company_phone: companyPhone,
      phone: companyPhone,
      firstName: customer?.firstName || '',
      lastName: customer?.lastName || '',
      expiryDate: '',
      planName: '',
      daysRemaining: '',
      companyName,
      companyPhone,
      ...(overrides || {}),
    };
  }

  private beirutDateString(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Beirut',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private prettyDate(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Beirut',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).formatToParts(date);
    const d = parts.find((p) => p.type === 'day')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const y = parts.find((p) => p.type === 'year')?.value;
    return `${d} ${m} ${y}`;
  }

  private daysUntil(date: Date): number {
    const today = new Date();
    const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
  }
}