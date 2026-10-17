import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { safeOrderBy } from '../../common/utils/sort';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryCustomerDto) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);

    const where: any = { deletedAt: null };
    if (query.search) {
      where.OR = [
        { phone: { contains: query.search } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.status) where.status = query.status;
    if (query.city) where.city = query.city;
    if (query.area) where.area = query.area;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: safeOrderBy(query.sortBy, ['firstName', 'lastName', 'phone', 'email', 'status', 'createdAt', 'updatedAt'] as const, 'createdAt', query.sortOrder),
        skip: (page - 1) * limit,
        take: limit,
        include: {
          subscriptions: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { plan: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async search(q: string) {
    if (!q) return [];
    return this.prisma.customer.findMany({
      where: {
        deletedAt: null,
        OR: [
          { phone: { contains: q } },
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        subscriptions: { where: { deletedAt: null }, include: { plan: true } },
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  async create(dto: CreateCustomerDto, userId: string) {
    const exists = await this.prisma.customer.findUnique({ where: { phone: dto.phone } });
    if (exists) {
      throw new ConflictException('Customer with this phone already exists');
    }

    const customer = await this.prisma.customer.create({
      data: {
        phone: dto.phone,
        email: dto.email || null,
        whatsappNumber: dto.whatsappNumber || null,
        firstName: dto.firstName,
        lastName: dto.lastName,
        address: dto.address || null,
        area: dto.area || null,
        city: dto.city || null,
        location: dto.location || null,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        notes: dto.notes || null,
        status: dto.status || 'active',
      },
    });

    await this.auditService.log({
      userId,
      action: 'CREATE',
      entity: 'Customer',
      entityId: customer.id,
      newValues: dto,
    });

    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto, userId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (dto.phone && dto.phone !== customer.phone) {
      const exists = await this.prisma.customer.findUnique({ where: { phone: dto.phone } });
      if (exists) {
        throw new ConflictException('Customer with this phone already exists');
      }
    }

    const updateData: any = {};
    const fields: Array<keyof UpdateCustomerDto> = [
      'phone', 'email', 'whatsappNumber', 'firstName', 'lastName',
      'address', 'area', 'city', 'location', 'latitude', 'longitude', 'notes', 'status',
    ];
    for (const field of fields) {
      if (dto[field] !== undefined) {
        updateData[field] = dto[field] ?? null;
      }
    }

    const updated = await this.prisma.customer.update({
      where: { id },
      data: updateData,
    });

    await this.auditService.log({
      userId,
      action: 'UPDATE',
      entity: 'Customer',
      entityId: id,
      oldValues: {
        phone: customer.phone,
        status: customer.status,
        firstName: customer.firstName,
        lastName: customer.lastName,
      },
      newValues: updateData,
    });

    return updated;
  }

  async remove(id: string, userId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditService.log({
      userId,
      action: 'DELETE',
      entity: 'Customer',
      entityId: id,
    });

    return { message: 'Customer deleted successfully' };
  }
}