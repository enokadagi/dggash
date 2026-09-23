import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'SALE' | 'REFUND' | 'SUBSCRIPTION_RENEWAL' | 'SUBSCRIPTION_SUSPEND' | 'SYSTEM';

export interface AuditEntry {
  userId?: string | null;
  action: AuditAction | string;
  entity: string;
  entityId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          oldValues: entry.oldValues != null ? JSON.stringify(entry.oldValues) : null,
          newValues: entry.newValues != null ? JSON.stringify(entry.newValues) : null,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
        },
      });
    } catch (error) {
      this.logger.debug(`Audit log failed: ${(error as Error).message}`);
    }
  }

  async logLogin(userId: string, ipAddress?: string | null, userAgent?: string | null): Promise<void> {
    return this.log({
      userId,
      action: 'LOGIN',
      entity: 'User',
      entityId: userId,
      ipAddress,
      userAgent,
    });
  }

  async list(filters: {
    page?: number;
    limit?: number;
    userId?: string;
    action?: string;
    entity?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }) {
    const page = Number(filters.page || 1);
    const limit = Number(filters.limit || 20);

    const where: any = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = filters.action;
    if (filters.entity) where.entity = filters.entity;
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }
    if (filters.search) {
      where.OR = [
        { entity: { contains: filters.search, mode: 'insensitive' } },
        { action: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, limit };
  }
}