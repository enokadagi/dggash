import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueryReportDto } from './dto/query-report.dto';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private dateRange(query: QueryReportDto) {
    const range: any = {};
    if (query.dateFrom) range.gte = new Date(query.dateFrom);
    if (query.dateTo) range.lte = new Date(query.dateTo);
    return Object.keys(range).length ? range : undefined;
  }

  async getRevenueReport(query: QueryReportDto) {
    const range = this.dateRange(query);
    const where: any = {
      status: 'COMPLETED',
      ...(range && { createdAt: range }),
    };

    const [sales, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
          user: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sale.aggregate({ where, _sum: { totalAmount: true }, _count: true }),
    ]);

    const byMethod = await this.prisma.sale.groupBy({
      by: ['paymentMethod'],
      where,
      _sum: { totalAmount: true },
      _count: true,
    });

    return {
      summary: {
        totalRevenue: Number(total._sum.totalAmount || 0),
        totalSales: total._count,
      },
      byMethod: byMethod.map((m) => ({
        method: m.paymentMethod,
        total: Number(m._sum.totalAmount || 0),
        count: m._count,
      })),
      sales,
    };
  }

  async getSalesReport(query: QueryReportDto) {
    const range = this.dateRange(query);
    const where: any = {
      ...(range && { createdAt: range }),
    };

    const [sales, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
          items: { select: { id: true, product: { select: { name: true, sku: true } }, quantity: true, unitPrice: true, totalPrice: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sale.aggregate({ where, _sum: { totalAmount: true }, _count: true }),
    ]);

    const byStatus = await this.prisma.sale.groupBy({
      by: ['status'],
      where,
      _sum: { totalAmount: true },
      _count: true,
    });

    return {
      summary: {
        totalAmount: Number(total._sum.totalAmount || 0),
        totalCount: total._count,
      },
      byStatus: byStatus.map((s) => ({
        status: s.status,
        total: Number(s._sum.totalAmount || 0),
        count: s._count,
      })),
      sales,
    };
  }

  async getCustomersReport(query: QueryReportDto) {
    const where: any = { deletedAt: null };

    const [totalCustomers, byStatus, recentCustomers, withWhatsapp] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      this.prisma.customer.findMany({
        where,
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { subscriptions: true, sales: true } } },
      }),
      this.prisma.customer.count({
        where: { ...where, whatsappNumber: { not: null } },
      }),
    ]);

    return {
      summary: { totalCustomers, withWhatsapp },
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      recentCustomers,
    };
  }

  async getSubscriptionsReport(query: QueryReportDto) {
    const where: any = { deletedAt: null };

    const [total, byStatus, byPlan, totalActive] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      this.prisma.subscription.groupBy({
        by: ['planId'],
        where,
        _count: true,
      }),
      this.prisma.subscription.count({ where: { ...where, status: 'ACTIVE' } }),
    ]);

    const plans = await this.prisma.plan.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, price: true, currency: true },
    });
    const planMap = new Map(plans.map((p) => [p.id, p]));

    return {
      summary: { totalSubscriptions: total, totalActive },
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      byPlan: byPlan.map((p) => ({
        planId: p.planId,
        planName: planMap.get(p.planId)?.name || p.planId,
        count: p._count,
      })),
    };
  }

  async getInventoryReport(query: QueryReportDto) {
    const where: any = { deletedAt: null };

    const products = await this.prisma.product.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      orderBy: { currentStock: 'asc' },
    });

    const byCategoryMap: Record<string, { count: number; totalStock: number; value: number }> = {};
    for (const p of products) {
      const category = p.category.name;
      byCategoryMap[category] = byCategoryMap[category] || { count: 0, totalStock: 0, value: 0 };
      byCategoryMap[category].count += 1;
      byCategoryMap[category].totalStock += p.currentStock;
      byCategoryMap[category].value += Number(p.purchasePrice) * p.currentStock;
    }

    const totalValue = products.reduce(
      (sum, p) => sum + Number(p.purchasePrice) * p.currentStock,
      0,
    );

    return {
      summary: {
        totalItems: products.length,
        totalQuantity: products.reduce((sum, p) => sum + p.currentStock, 0),
        totalValue,
      },
      byCategory: Object.entries(byCategoryMap).map(([name, v]) => ({
        category: name,
        count: v.count,
        totalStock: v.totalStock,
        value: v.value,
      })),
      lowStock: products.filter((p) => p.currentStock <= p.minStock),
    };
  }

  async getStockMovementsReport(query: QueryReportDto) {
    const range = this.dateRange(query);
    const where: any = {
      ...(range && { createdAt: range }),
    };

    const [movements, byType] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          user: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockMovement.groupBy({
        by: ['movementType'],
        where,
        _sum: { quantity: true },
        _count: true,
      }),
    ]);

    return {
      summary: {
        totalMovements: movements.length,
        inbound: movements
          .filter((m) => ['PURCHASE', 'RETURN', 'ADJUSTMENT'].includes(m.movementType) && m.quantity > 0)
          .reduce((sum, m) => sum + m.quantity, 0),
        outbound: movements
          .filter((m) => ['DAMAGED', 'LOST', 'SALE'].includes(m.movementType) || m.quantity < 0)
          .reduce((sum, m) => sum + Math.abs(m.quantity), 0),
      },
      byType: byType.map((t) => ({
        type: t.movementType,
        totalQuantity: t._sum.quantity || 0,
        count: t._count,
      })),
      movements,
    };
  }

  async getFinancialOverview() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [liveSubs, allCustomersWithSubs, currentRevenue, prevRevenue] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { deletedAt: null, status: { in: ['ACTIVE', 'EXPIRING_SOON'] } },
        include: { plan: { select: { price: true, durationDays: true } } },
      }),
      this.prisma.subscription.findMany({
        where: { deletedAt: null },
        select: { customerId: true, status: true },
      }),
      this.prisma.sale.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: monthStart } },
        _sum: { totalAmount: true },
      }),
      this.prisma.sale.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: prevMonthStart, lt: monthStart } },
        _sum: { totalAmount: true },
      }),
    ]);

    const mrr = liveSubs.reduce((sum, sub) => {
      const monthly = (Number(sub.plan.price) * 30) / Math.max(sub.plan.durationDays || 30, 1);
      return sum + monthly;
    }, 0);

    const liveIds = new Set(liveSubs.map((s) => s.customerId));
    const historicalIds = new Set(allCustomersWithSubs.map((s) => s.customerId));
    const churnedCustomerCount = [...historicalIds].filter((id) => !liveIds.has(id)).length;

    const currentTotal = Number(currentRevenue._sum.totalAmount || 0);
    const prevTotal = Number(prevRevenue._sum.totalAmount || 0);
    const revenueGrowth = prevTotal > 0 ? +(((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1) : 0;

    return {
      mrr: +mrr.toFixed(2),
      activeCustomerCount: liveIds.size,
      churnedCustomerCount,
      revenueGrowth,
    };
  }

  async getWhatsAppReport(query: QueryReportDto) {
    const range = this.dateRange(query);
    const where: any = {
      ...(range && { createdAt: range }),
    };

    const [byStatus, messages, total] = await Promise.all([
      this.prisma.whatsAppMessage.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      this.prisma.whatsAppMessage.findMany({
        where,
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
      }),
      this.prisma.whatsAppMessage.count({ where }),
    ]);

    const statusMap = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));
    const sent = (statusMap.sent || 0) + (statusMap.delivered || 0) + (statusMap.read || 0);
    const failed = statusMap.failed || 0;

    return {
      summary: {
        totalMessages: total,
        delivered: sent,
        failed,
        pending: statusMap.pending || 0,
        deliveryRate: sent + failed === 0 ? null : +(sent / (sent + failed)).toFixed(3),
      },
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      messages,
    };
  }
}