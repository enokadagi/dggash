import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { QuerySaleDto } from './dto/query-sale.dto';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QuerySaleDto) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = query.customerId;
    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }
    if (query.search) {
      where.OR = [
        { saleNumber: { contains: query.search, mode: 'insensitive' } },
        { customer: { phone: { contains: query.search } } },
        { customer: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { customer: { lastName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const data = await this.prisma.sale.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true, barcode: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const total = await this.prisma.sale.count({ where });

    return { data, total, page, limit };
  }

  async findById(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { product: { include: { category: true } } } },
      },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  async create(dto: CreateSaleDto, userId: string) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('A sale must contain at least one line item');
    }

    const quantityByProduct = new Map<string, number>();
    for (const item of dto.items) {
      quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) || 0) + item.quantity);
    }
    const itemRows = Array.from(quantityByProduct, ([productId, quantity]) => ({ productId, quantity }));
    const productIds = [...new Set(itemRows.map((row) => row.productId))];

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null, isActive: true },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more products do not exist or are inactive');
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    const lines = itemRows.map((row) => {
      const product = productMap.get(row.productId)!;
      const unitPrice = Number(product.sellingPrice);
      const totalPrice = unitPrice * row.quantity;
      return {
        productId: row.productId,
        quantity: row.quantity,
        unitPrice: new Prisma.Decimal(unitPrice).toFixed(2),
        totalPrice: new Prisma.Decimal(totalPrice).toFixed(2),
      };
    });

    const totalAmount = lines.reduce((sum, line) => sum + Number(line.totalPrice), 0);
    const currency = dto.currency || products[0]?.currency || 'USD';

    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, deletedAt: null },
      });
      if (!customer) throw new NotFoundException('Customer not found');
    }

    const sale = await this.prisma.$transaction(async (tx) => {
      for (const line of lines) {
        const product = productMap.get(line.productId)!;
        const result = await tx.product.updateMany({
          where: { id: line.productId, currentStock: { gte: line.quantity }, deletedAt: null },
          data: { currentStock: { decrement: line.quantity } },
        });
        if (result.count !== 1) {
          throw new BadRequestException(
            `Insufficient stock for "${product.name}" (${product.sku}): only ${product.currentStock} available`,
          );
        }
      }

      let saleNumber = this.generateSaleNumber();
      let created: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          created = await tx.sale.create({
            data: {
              saleNumber,
              customerId: dto.customerId || null,
              userId: userId || null,
              totalAmount: new Prisma.Decimal(totalAmount).toFixed(2),
              currency,
              paymentMethod: dto.paymentMethod,
              status: 'COMPLETED',
              notes: dto.notes || null,
              items: {
                create: lines.map((line) => ({
                  productId: line.productId,
                  quantity: line.quantity,
                  unitPrice: new Prisma.Decimal(line.unitPrice),
                  totalPrice: new Prisma.Decimal(line.totalPrice),
                })),
              },
            },
            include: { items: true },
          });
          break;
        } catch (error) {
          if (
            attempt < 2 &&
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            saleNumber = this.generateSaleNumber();
            continue;
          }
          throw error;
        }
      }

      for (const line of lines) {
        const product = productMap.get(line.productId)!;
        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            userId: userId || null,
            movementType: 'SALE',
            quantity: line.quantity,
            previousStock: product.currentStock,
            newStock: product.currentStock - line.quantity,
            reference: saleNumber,
            notes: `Sale ${saleNumber}`,
          },
        });
      }

      return created;
    });

    await this.auditService.log({
      userId,
      action: 'SALE',
      entity: 'Sale',
      entityId: sale.id,
      newValues: { saleNumber: sale.saleNumber, totalAmount, items: dto.items },
    });

    return {
      sale: await this.findById(sale.id),
      receipt: {
        saleNumber: sale.saleNumber,
        totalAmount,
        currency,
        paymentMethod: dto.paymentMethod,
        items: dto.items.length,
        soldAt: sale.createdAt,
      },
    };
  }

  async refund(id: string, userId: string, reason?: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id }, include: { items: true } });
      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.status !== 'COMPLETED') throw new BadRequestException(`Sale cannot be refunded: current status is "${sale.status}"`);
      for (const item of sale.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new NotFoundException('Product not found');
        await tx.product.updateMany({
          where: { id: item.productId, deletedAt: null },
          data: { currentStock: { increment: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            userId: userId || null,
            movementType: 'RETURN',
            quantity: item.quantity,
            previousStock: product.currentStock,
            newStock: product.currentStock + item.quantity,
            reference: `refund-${sale.saleNumber}`,
            notes: reason || `Refund of sale ${sale.saleNumber}`,
          },
        });
      }

      return tx.sale.update({
        where: { id },
        data: { status: 'REFUNDED' },
        include: { customer: true, items: { include: { product: true } } },
      });
    });

    await this.auditService.log({
      userId,
      action: 'REFUND',
      entity: 'Sale',
      entityId: id,
      newValues: { saleNumber: updated.saleNumber, reason },
    });

    return updated;
  }

  async cancel(id: string, userId: string, reason?: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id }, include: { items: true } });
      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.status !== 'COMPLETED') throw new BadRequestException(`Sale cannot be cancelled: current status is "${sale.status}"`);
      for (const item of sale.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        await tx.product.updateMany({
          where: { id: item.productId, deletedAt: null },
          data: { currentStock: { increment: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            userId: userId || null,
            movementType: 'RETURN',
            quantity: item.quantity,
            previousStock: product.currentStock,
            newStock: product.currentStock + item.quantity,
            reference: `cancel-${sale.saleNumber}`,
            notes: reason || `Cancellation of sale ${sale.saleNumber}`,
          },
        });
      }

      return tx.sale.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
    });

    await this.auditService.log({
      userId,
      action: 'UPDATE',
      entity: 'Sale',
      entityId: id,
      newValues: { saleNumber: updated.saleNumber, status: 'CANCELLED', reason },
    });

    return updated;
  }

  private generateSaleNumber(): string {
    const now = new Date();
    const ymd = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('');
    const suffix = crypto.randomInt(1000000).toString().padStart(6, '0');
    return `S-${ymd}-${suffix}`;
  }
}