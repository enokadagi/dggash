import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { QueryPlanDto } from './dto/query-plan.dto';

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryPlanDto) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);

    const where: any = { deletedAt: null };
    if (query.search) {
      where.OR = [{ name: { contains: query.search, mode: 'insensitive' } }];
    }
    if (query.isActive !== undefined) where.isActive = query.isActive === 'true';

    const [data, total] = await this.prisma.$transaction([
      this.prisma.plan.findMany({
        where,
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.plan.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findActive() {
    return this.prisma.plan.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { price: 'asc' },
    });
  }

  async findById(id: string) {
    const plan = await this.prisma.plan.findFirst({ where: { id, deletedAt: null } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    return plan;
  }

  async create(dto: CreatePlanDto, userId: string) {
    const exists = await this.prisma.plan.findFirst({
      where: { name: dto.name, deletedAt: null },
    });
    if (exists) {
      throw new ConflictException('A plan with this name already exists');
    }

    const plan = await this.prisma.plan.create({
      data: {
        name: dto.name,
        description: dto.description || null,
        speed: dto.speed,
        durationDays: dto.durationDays,
        price: dto.price,
        currency: dto.currency || 'USD',
        isActive: dto.isActive ?? true,
      },
    });

    await this.auditService.log({
      userId,
      action: 'CREATE',
      entity: 'Plan',
      entityId: plan.id,
      newValues: dto,
    });

    return plan;
  }

  async update(id: string, dto: UpdatePlanDto, userId: string) {
    const plan = await this.prisma.plan.findFirst({ where: { id, deletedAt: null } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (dto.name && dto.name !== plan.name) {
      const exists = await this.prisma.plan.findFirst({
        where: { name: dto.name, deletedAt: null, id: { not: id } },
      });
      if (exists) {
        throw new ConflictException('A plan with this name already exists');
      }
    }

    const updateData: any = {};
    const fields: Array<keyof UpdatePlanDto> = [
      'name', 'description', 'speed', 'durationDays', 'price', 'currency', 'isActive',
    ];
    for (const field of fields) {
      if (dto[field] !== undefined) {
        updateData[field] = dto[field];
      }
    }

    const updated = await this.prisma.plan.update({
      where: { id },
      data: updateData,
    });

    await this.auditService.log({
      userId,
      action: 'UPDATE',
      entity: 'Plan',
      entityId: id,
      oldValues: { name: plan.name, price: plan.price },
      newValues: updateData,
    });

    return updated;
  }

  async remove(id: string, userId: string) {
    const plan = await this.prisma.plan.findFirst({ where: { id, deletedAt: null } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    await this.prisma.plan.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.auditService.log({
      userId,
      action: 'DELETE',
      entity: 'Plan',
      entityId: id,
    });

    return { message: 'Plan deleted successfully' };
  }
}