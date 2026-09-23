import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../common/services/cache.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  async getKPIs() {
    return this.cache.getOrSet('dashboard:kpis', async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const [
        totalCustomers,
        activeSubscriptions,
        expiringSubscriptions,
        totalRevenue,
        todaySales,
        totalProducts,
        totalStock,
        lowStock,
        pendingMessages,
        suspendedSubscriptions,
      ] = await Promise.all([
        this.prisma.customer.count({ where: { deletedAt: null } }),
        this.prisma.subscription.count({ where: { status: 'ACTIVE', deletedAt: null } }),
        this.prisma.subscription.count({ where: { status: 'EXPIRING_SOON', deletedAt: null } }),
        this.prisma.sale.aggregate({
          where: { status: 'COMPLETED' },
          _sum: { totalAmount: true },
          _count: true,
        }),
        this.prisma.sale.aggregate({
          where: { status: 'COMPLETED', createdAt: { gte: todayStart } },
          _sum: { totalAmount: true },
          _count: true,
        }),
        this.prisma.product.count({ where: { isActive: true, deletedAt: null } }),
        this.prisma.product.aggregate({
          where: { deletedAt: null },
          _sum: { currentStock: true },
        }),
        this.countLowStock(),
        this.prisma.whatsAppMessage.count({ where: { status: 'pending' } }),
        this.prisma.subscription.count({ where: { status: 'SUSPENDED', deletedAt: null } }),
      ]);

      const inventoryValue = await this.getInventoryValue();

      return {
        totalCustomers,
        activeSubscriptions,
        expiringSubscriptions,
        totalRevenue: Number(totalRevenue._sum.totalAmount || 0),
        totalSales: totalRevenue._count,
        todayRevenue: Number(todaySales._sum.totalAmount || 0),
        todaySalesCount: todaySales._count,
        inventory: {
          totalProducts,
          totalStock: Number(totalStock._sum.currentStock || 0),
          totalValue: inventoryValue,
          lowStock,
        },
        whatsapp: {
          pendingMessages,
          configured: !!(process.env.WHATSAPP_PHONE_NUMBER_ID && (process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN)),
        },
        suspendedSubscriptions,
      };
    }, 60000);
  }

  async getRevenueChart(period: string = 'monthly') {
    return this.cache.getOrSet(
      `dashboard:revenue:${period}`,
      async () => {
        const now = new Date();
        let startDate: Date;

        if (period === 'daily') {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
        } else if (period === 'weekly') {
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        } else {
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
        }

        const sales = await this.prisma.sale.findMany({
          where: {
            status: 'COMPLETED',
            createdAt: { gte: startDate },
          },
          select: {
            totalAmount: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        });

        const grouped: Record<string, number> = {};

        sales.forEach((sale) => {
          const date = new Date(sale.createdAt);
          let key: string;

          if (period === 'daily') {
            key = date.toISOString().split('T')[0];
          } else if (period === 'weekly') {
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            key = weekStart.toISOString().split('T')[0];
          } else {
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          }

          grouped[key] = (grouped[key] || 0) + Number(sale.totalAmount);
        });

        return Object.entries(grouped).map(([date, revenue]) => ({
          date,
          revenue,
        }));
      },
      300000,
    );
  }

  async getRecentActivity() {
    const [
      recentSales,
      recentCustomers,
      recentSubscriptions,
      recentMessages,
    ] = await Promise.all([
      this.prisma.sale.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.customer.findMany({
        take: 5,
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.subscription.findMany({
        take: 5,
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true } },
          plan: { select: { id: true, name: true } },
        },
      }),
      this.prisma.whatsAppMessage.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    return {
      recentSales,
      recentCustomers,
      recentSubscriptions,
      recentMessages,
    };
  }

  async getAlerts() {
    return this.cache.getOrSet('dashboard:alerts', async () => {
      const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      const [
        expiringSubscriptions,
        lowStockProducts,
        failedMessages,
      ] = await Promise.all([
        this.prisma.subscription.findMany({
          where: {
            deletedAt: null,
            status: { in: ['ACTIVE', 'EXPIRING_SOON'] },
            expiryDate: { lte: soon, gte: new Date() },
          },
          take: 5,
          orderBy: { expiryDate: 'asc' },
          include: {
            customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
            plan: { select: { id: true, name: true } },
          },
        }),
        this.getLowStockProducts(5),
        this.prisma.whatsAppMessage.findMany({
          where: { status: 'failed' },
          take: 5,
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      return {
        expiringSubscriptions,
        lowStockProducts,
        failedWhatsAppMessages: failedMessages,
      };
    }, 30000);
  }

  private async countLowStock(): Promise<number> {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      select: { currentStock: true, minStock: true },
    });
    return products.filter((p) => p.currentStock <= p.minStock).length;
  }

  private async getLowStockProducts(take = 20) {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { currentStock: 'asc' },
    });
    return products
      .filter((p) => p.currentStock <= p.minStock)
      .slice(0, take);
  }

  private async getInventoryValue(): Promise<number> {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      select: { purchasePrice: true, currentStock: true },
    });
    return products.reduce(
      (sum, p) => sum + Number(p.purchasePrice) * p.currentStock,
      0,
    );
  }
}