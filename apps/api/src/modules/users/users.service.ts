import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ChangeUserPasswordDto } from './dto/change-user-password.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryUserDto) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);

    const where: any = { deletedAt: null };
    if (query.search) {
      where.OR = [
        { phone: { contains: query.search } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          phone: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async create(dto: CreateUserDto, actorId: string) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) {
      throw new ConflictException('Phone number already in use');
    }

    if (dto.email) {
      const emailExists = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailExists) {
        throw new ConflictException('Email already in use');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        email: dto.email || null,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        role: dto.role || 'STAFF',
        status: dto.status || 'ACTIVE',
      },
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    await this.auditService.log({
      userId: actorId,
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      newValues: { ...dto, password: '[REDACTED]' },
    });

    return user;
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    if (dto.email && dto.email !== user.email) {
      const emailExists = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailExists && emailExists.id !== id) {
        throw new ConflictException('Email already in use');
      }
    }

    const updateData: any = {};
    if (dto.firstName !== undefined) updateData.firstName = dto.firstName;
    if (dto.lastName !== undefined) updateData.lastName = dto.lastName;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.role !== undefined) updateData.role = dto.role;
    if (dto.status !== undefined) updateData.status = dto.status;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    });

    await this.auditService.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      oldValues: { role: user.role, status: user.status },
      newValues: updateData,
    });

    return updated;
  }

  async changeUserPassword(id: string, dto: ChangeUserPasswordDto, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    await this.auditService.log({
      userId: actorId,
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
    });

    return { message: 'Password updated successfully' };
  }

  async remove(id: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    if (id === actorId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });

    await this.auditService.log({
      userId: actorId,
      action: 'DELETE',
      entity: 'User',
      entityId: id,
    });

    return { message: 'User deactivated successfully' };
  }
}