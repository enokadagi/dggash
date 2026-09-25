import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StockMovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { QueryStockMovementDto } from './dto/query-stock-movement.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getLifecycleStats() {
    const where = { deletedAt: null };
    const products = await this.prisma.product.findMany({ where, select: { currentStock: true } });

    const totalAssets = products.length;
    const inUse = products.filter((p) => p.currentStock > 0).length;
    const available = products.reduce((sum, p) => sum + p.currentStock, 0);

    return {
      totalAssets,
      inUse,
      available,
      depreciatedValue: 0,
    };
  }

  // ─── Categories ────────────────────────────────────────

  async findCategories() {
    return this.prisma.inventoryCategory.findMany({
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(dto: CreateCategoryDto, userId: string) {
    const exists = await this.prisma.inventoryCategory.findUnique({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Category already exists');

    const category = await this.prisma.inventoryCategory.create({ data: { name: dto.name, description: dto.description || null } });

    await this.auditService.log({
      userId,
      action: 'CREATE',
      entity: 'InventoryCategory',
      entityId: category.id,
      newValues: dto,
    });
    return category;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, userId: string) {
    const category = await this.prisma.inventoryCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    if (dto.name && dto.name !== category.name) {
      const exists = await this.prisma.inventoryCategory.findUnique({ where: { name: dto.name } });
      if (exists) throw new ConflictException('Category already exists');
    }

    const updated = await this.prisma.inventoryCategory.update({
      where: { id },
      data: { name: dto.name ?? undefined, description: dto.description ?? undefined },
    });

    await this.auditService.log({
      userId,
      action: 'UPDATE',
      entity: 'InventoryCategory',
      entityId: id,
      newValues: dto,
    });
    return updated;
  }

  async removeCategory(id: string, userId: string) {
    const category = await this.prisma.inventoryCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    const productCount = await this.prisma.product.count({ where: { categoryId: id, deletedAt: null } });
    if (productCount > 0) {
      throw new BadRequestException(`Cannot delete category "${category.name}": it still has ${productCount} product(s). Move them to another category first.`);
    }

    await this.prisma.inventoryCategory.delete({ where: { id } });

    await this.auditService.log({
      userId,
      action: 'DELETE',
      entity: 'InventoryCategory',
      entityId: id,
    });
    return { message: 'Category deleted successfully' };
  }

  // ─── Products ──────────────────────────────────────────

  async findAll(query: QueryProductDto) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);

    const where: any = { deletedAt: null };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { barcode: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.isActive !== undefined) where.isActive = query.isActive === 'true';

    let items = await this.prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
    });

    if (query.lowStock === 'true') {
      items = items.filter((p) => p.currentStock <= p.minStock);
    }

    const total = items.length;
    const data = items.slice((page - 1) * limit, page * limit);

    return { data, total, page, limit };
  }

  async getLowStock() {
    const products = await this.prisma.product.findMany({ where: { deletedAt: null } });
    return products.filter((p) => p.currentStock <= p.minStock);
  }

  async getSummary() {
    const products = await this.prisma.product.findMany({ where: { deletedAt: null } });
    const totalProducts = products.length;
    const totalStock = products.reduce((sum, p) => sum + p.currentStock, 0);
    const totalValue = products.reduce((sum, p) => sum + Number(p.purchasePrice) * p.currentStock, 0);
    const lowStock = products.filter((p) => p.currentStock <= p.minStock).length;
    const outOfStock = products.filter((p) => p.currentStock === 0).length;
    return {
      totalProducts,
      totalStock,
      totalValue,
      lowStock,
      outOfStock,
      categories: await this.prisma.inventoryCategory.count(),
    };
  }

  async lookup(query: string) {
    if (!query) throw new BadRequestException('Query parameter "q" is required');

    const product = await this.prisma.product.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { barcode: query.trim() },
          { sku: query.trim() },
          { id: query.trim() },
          { name: { contains: query.trim(), mode: 'insensitive' } },
        ],
      },
      include: { category: true },
    });

    return product || null;
  }

  async findById(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { category: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(dto: CreateProductDto, userId: string) {
    const category = await this.prisma.inventoryCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    const skuExists = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
    if (skuExists) throw new ConflictException('SKU already exists');

    if (dto.barcode) {
      const barcodeExists = await this.prisma.product.findUnique({ where: { barcode: dto.barcode } });
      if (barcodeExists) throw new ConflictException('Barcode already exists');
    }

    const initialStock = dto.initialStock ?? 0;
    if (initialStock < 0) throw new BadRequestException('Initial stock cannot be negative');

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: dto.name,
          sku: dto.sku,
          barcode: dto.barcode || null,
          categoryId: dto.categoryId,
          description: dto.description || null,
          imageUrl: dto.imageUrl || null,
          purchasePrice: dto.purchasePrice,
          sellingPrice: dto.sellingPrice,
          currency: dto.currency || 'USD',
          currentStock: initialStock,
          minStock: dto.minStock || 0,
          unit: dto.unit || 'piece',
          isActive: dto.isActive ?? true,
        },
      });

      if (initialStock > 0) {
        await tx.stockMovement.create({
          data: {
            productId: created.id,
            userId: userId || null,
            movementType: 'PURCHASE',
            quantity: initialStock,
            previousStock: 0,
            newStock: initialStock,
            reference: 'initial-stock',
            notes: dto.initialStockNote || 'Initial stock on product creation',
          },
        });
      }

      return created;
    });

    await this.auditService.log({
      userId,
      action: 'CREATE',
      entity: 'Product',
      entityId: product.id,
      newValues: { ...dto, sku: dto.sku, barcode: dto.barcode },
    });

    return product;
  }

  async update(id: string, dto: UpdateProductDto, userId: string) {
    const product = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw new NotFoundException('Product not found');

    if (dto.sku && dto.sku !== product.sku) {
      const exists = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
      if (exists) throw new ConflictException('SKU already exists');
    }
    if (dto.barcode && dto.barcode !== product.barcode) {
      const exists = await this.prisma.product.findUnique({ where: { barcode: dto.barcode } });
      if (exists) throw new ConflictException('Barcode already exists');
    }
    if (dto.categoryId) {
      const category = await this.prisma.inventoryCategory.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Category not found');
    }

    const updateData: Prisma.ProductUpdateInput = {};
    const fields: Array<keyof UpdateProductDto> = [
      'name', 'sku', 'barcode', 'categoryId', 'description', 'imageUrl',
      'purchasePrice', 'sellingPrice', 'currency', 'minStock', 'unit', 'isActive',
    ];
    for (const field of fields) {
      if (dto[field] !== undefined) {
        if (field === 'categoryId') {
          updateData.category = { connect: { id: dto[field] as string } };
        } else {
          (updateData as any)[field] = dto[field];
        }
      }
    }

    const updated = await this.prisma.product.update({ where: { id }, data: updateData });

    await this.auditService.log({
      userId,
      action: 'UPDATE',
      entity: 'Product',
      entityId: id,
      oldValues: { name: product.name, sellingPrice: product.sellingPrice, minStock: product.minStock },
      newValues: updateData,
    });

    return updated;
  }

  async remove(id: string, userId: string) {
    const product = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw new NotFoundException('Product not found');

    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });

    await this.auditService.log({
      userId,
      action: 'DELETE',
      entity: 'Product',
      entityId: id,
    });

    return { message: 'Product deleted successfully' };
  }

  // ─── Stock movements ───────────────────────────────────

  async findMovements(query: QueryStockMovementDto) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);

    const where: any = {};
    if (query.productId) where.productId = query.productId;
    if (query.movementType) where.movementType = query.movementType;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    const data = await this.prisma.stockMovement.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, barcode: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const total = await this.prisma.stockMovement.count({ where });

    return { data, total, page, limit };
  }

  async createMovement(productId: string, dto: CreateStockMovementDto, userId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) throw new NotFoundException('Product not found');

    const delta = this.movementDelta(dto.movementType as StockMovementType, dto.quantity);
    const newStock = product.currentStock + delta;
    if (newStock < 0) {
      throw new BadRequestException('Insufficient stock: operation would leave negative stock');
    }

    const movement = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: productId },
        data: { currentStock: newStock },
      });

      return tx.stockMovement.create({
        data: {
          productId,
          userId: userId || null,
          movementType: dto.movementType as StockMovementType,
          quantity: dto.quantity,
          previousStock: product.currentStock,
          newStock: updated.currentStock,
          reference: dto.reference || null,
          notes: dto.notes || null,
        },
      });
    });

    await this.auditService.log({
      userId,
      action: 'UPDATE',
      entity: 'Product',
      entityId: productId,
      newValues: { movementType: dto.movementType, quantity: dto.quantity, newStock },
    });

    return movement;
  }

  async findProductMovements(productId: string) {
    return this.prisma.stockMovement.findMany({
      where: { productId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private movementDelta(
    type: StockMovementType,
    quantity: number,
  ): number {
    switch (type) {
      case 'PURCHASE':
      case 'RETURN':
        return Math.abs(quantity);
      case 'ADJUSTMENT':
      case 'CORRECTION':
        return quantity;
      case 'DAMAGED':
      case 'LOST':
      case 'SALE':
        return -Math.abs(quantity);
      default:
        return -Math.abs(quantity);
    }
  }
}