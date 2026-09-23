import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { QuerySubscriptionDto } from './dto/query-subscription.dto';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  @Cron('0 * * * *')
  async refreshStatusesOnSchedule() {
    try {
      const result = await this.refreshAllStatuses();
      if (result.expired > 0 || result.expiringSoon > 0) {
        this.logger.log(
          `Subscriptions status refresh: expired=${result.expired} expiringSoon=${result.expiringSoon} active=${result.active}`,
        );
      }
    } catch (error: any) {
      this.logger.error(`Subscription status refresh failed: ${error.message}`);
    }
  }

  async findAll(query: QuerySubscriptionDto) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);

    const where: any = { deletedAt: null };
    if (query.search) {
      where.OR = [
        { customer: { phone: { contains: query.search } } },
        { customer: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { customer: { lastName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.status) where.status = query.status;
    if (query.planId) where.planId = query.planId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.expiringSoon === 'true' || query.expiringSoon === '1') {
      const warnWindow = await this.getExpiryWarningWindow();
      where.status = 'ACTIVE';
      where.expiryDate = { lte: new Date(Date.now() + warnWindow * 24 * 60 * 60 * 1000) };
    }

    const data = await this.prisma.subscription.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true, status: true } },
        plan: { select: { id: true, name: true, speed: true, price: true, durationDays: true, currency: true } },
      },
      orderBy: { [query.sortBy || 'expiryDate']: query.sortOrder || 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const total = await this.prisma.subscription.count({ where });

    return { data, total, page, limit };
  }

  async findById(id: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: true,
        plan: true,
        reminders: { orderBy: { scheduledFor: 'asc' } },
      },
    });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    return subscription;
  }

  async create(dto: CreateSubscriptionDto, userId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const plan = await this.prisma.plan.findFirst({
      where: { id: dto.planId, deletedAt: null, isActive: true },
    });
    if (!plan) throw new NotFoundException('Plan not found');

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const durationDays = dto.durationDays || plan.durationDays;
    const expiryDate = new Date(startDate);
    expiryDate.setDate(expiryDate.getDate() + durationDays);
    const warnWindow = await this.getExpiryWarningWindow();

    const subscription = await this.prisma.subscription.create({
      data: {
        customerId: dto.customerId,
        planId: dto.planId,
        startDate,
        expiryDate,
        status: this.computeExpiryStatus(expiryDate, warnWindow),
        paymentStatus: dto.paymentStatus || 'paid',
        notes: dto.notes || null,
        lastRenewalDate: startDate,
      },
      include: { customer: true, plan: true },
    });

    await this.auditService.log({
      userId,
      action: 'CREATE',
      entity: 'Subscription',
      entityId: subscription.id,
      newValues: { customerId: dto.customerId, planId: dto.planId, expiryDate },
    });

    return subscription;
  }

  async update(id: string, dto: UpdateSubscriptionDto, userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id, deletedAt: null },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');

    const updateData: Prisma.SubscriptionUpdateInput = {};
    if (dto.planId) {
      const plan = await this.prisma.plan.findFirst({ where: { id: dto.planId, deletedAt: null } });
      if (!plan) throw new NotFoundException('Plan not found');
      updateData.plan = { connect: { id: dto.planId } };
    }
    if (dto.startDate) updateData.startDate = new Date(dto.startDate);
    if (dto.expiryDate) updateData.expiryDate = new Date(dto.expiryDate);
    if (dto.paymentStatus !== undefined) updateData.paymentStatus = dto.paymentStatus;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    if (dto.expiryDate || dto.startDate) {
      const warnWindow = await this.getExpiryWarningWindow();
      const nextExpiry = (updateData.expiryDate as Date | undefined) || subscription.expiryDate;
      updateData.status = nextExpiry
        ? this.computeExpiryStatus(nextExpiry, warnWindow)
        : subscription.status;
    }

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: updateData,
      include: { customer: true, plan: true },
    });

    await this.auditService.log({
      userId,
      action: 'UPDATE',
      entity: 'Subscription',
      entityId: id,
      newValues: dto,
    });

    return updated;
  }

  async renew(id: string, dto: RenewSubscriptionDto, userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id, deletedAt: null },
      include: { plan: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');

    const targetPlan = dto.planId
      ? await this.prisma.plan.findFirst({ where: { id: dto.planId, deletedAt: null, isActive: true } })
      : subscription.plan;
    if (!targetPlan) throw new NotFoundException('Plan not found');

    const now = new Date();
    const startDate = subscription.expiryDate > now ? subscription.expiryDate : now;
    const durationDays = dto.durationDays || targetPlan.durationDays;
    const expiryDate = new Date(startDate);
    expiryDate.setDate(expiryDate.getDate() + durationDays);
    const warnWindow = await this.getExpiryWarningWindow();

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.whatsAppReminder.deleteMany({ where: { subscriptionId: id } });

      await tx.subscriptionRenewal.create({
        data: {
          subscriptionId: id,
          userId,
          previousPlanId: subscription.planId,
          newPlanId: targetPlan.id,
          previousExpiryDate: subscription.expiryDate,
          newExpiryDate: expiryDate,
          durationDays,
        },
      });

      return tx.subscription.update({
        where: { id },
        data: {
          planId: targetPlan.id,
          startDate,
          expiryDate,
          status: this.computeExpiryStatus(expiryDate, warnWindow),
          paymentStatus: 'paid',
          lastRenewalDate: startDate,
        },
        include: { customer: true, plan: true },
      });
    });

    await this.auditService.log({
      userId,
      action: 'SUBSCRIPTION_RENEWAL',
      entity: 'Subscription',
      entityId: id,
      oldValues: {
        status: subscription.status,
        planId: subscription.planId,
        expiryDate: subscription.expiryDate,
      },
      newValues: { planId: targetPlan.id, expiryDate, durationDays },
    });

    return updated;
  }

  async suspend(id: string, userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id, deletedAt: null },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: { status: 'SUSPENDED' as SubscriptionStatus },
      include: { customer: true, plan: true },
    });

    await this.auditService.log({
      userId,
      action: 'SUBSCRIPTION_SUSPEND',
      entity: 'Subscription',
      entityId: id,
    });

    return updated;
  }

  async activate(id: string, userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id, deletedAt: null },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');

    const warnWindow = await this.getExpiryWarningWindow();
    const updated = await this.prisma.subscription.update({
      where: { id },
      data: { status: this.computeExpiryStatus(subscription.expiryDate, warnWindow) },
      include: { customer: true, plan: true },
    });

    await this.auditService.log({
      userId,
      action: 'UPDATE',
      entity: 'Subscription',
      entityId: id,
    });

    return updated;
  }

  async cancel(id: string, userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id, deletedAt: null },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');

    await this.prisma.subscription.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditService.log({
      userId,
      action: 'DELETE',
      entity: 'Subscription',
      entityId: id,
    });

    return { message: 'Subscription cancelled successfully' };
  }

  async refreshAllStatuses(userId?: string) {
    const now = new Date();
    const warnWindow = await this.getExpiryWarningWindow();
    const threshold = new Date(now.getTime() + warnWindow * 24 * 60 * 60 * 1000);

    const expired = await this.prisma.subscription.updateMany({
      where: { deletedAt: null, status: { not: 'SUSPENDED' }, expiryDate: { lt: now } },
      data: { status: 'EXPIRED' as SubscriptionStatus },
    });

    const expiringSoon = await this.prisma.subscription.updateMany({
      where: {
        deletedAt: null,
        status: { not: 'SUSPENDED' },
        expiryDate: { gte: now, lte: threshold },
      },
      data: { status: 'EXPIRING_SOON' as SubscriptionStatus },
    });

    const active = await this.prisma.subscription.updateMany({
      where: { deletedAt: null, status: { not: 'SUSPENDED' }, expiryDate: { gt: threshold } },
      data: { status: 'ACTIVE' as SubscriptionStatus },
    });

    return { expired: expired.count, expiringSoon: expiringSoon.count, active: active.count };
  }

  private async getExpiryWarningWindow(): Promise<number> {
    const setting = await this.prisma.companySetting.findUnique({
      where: { key: 'subscription_expiry_warning_days' },
    });
    if (setting) {
      const parsed = parseInt(setting.value, 10);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
    return 7;
  }

  private computeExpiryStatus(expiryDate: Date, warnWindowDays = 7): SubscriptionStatus {
    const now = new Date();
    if (expiryDate.getTime() < now.getTime()) return 'EXPIRED';
    const threshold = now.getTime() + warnWindowDays * 24 * 60 * 60 * 1000;
    if (expiryDate.getTime() <= threshold) return 'EXPIRING_SOON';
    return 'ACTIVE';
  }
}