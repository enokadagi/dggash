import { DashboardService } from './dashboard.service';
import { CacheService } from '../../common/services/cache.service';

const mockPrisma = {
  customer: { count: jest.fn() },
  subscription: { count: jest.fn() },
  sale: {
    aggregate: jest.fn(),
    findMany: jest.fn(),
  },
  product: {
    count: jest.fn(),
    aggregate: jest.fn(),
    findMany: jest.fn(),
  },
  whatsAppMessage: { count: jest.fn(), findMany: jest.fn() },
};

const mockCache = {
  getOrSet: jest.fn((key, factory) => factory()),
  get: jest.fn(),
  set: jest.fn(),
};

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DashboardService(mockPrisma as any, mockCache as any);
  });

  describe('getKPIs', () => {
    it('should return all KPI metrics', async () => {
      mockPrisma.customer.count.mockResolvedValue(4);
      mockPrisma.subscription.count
        .mockResolvedValueOnce(3) // ACTIVE
        .mockResolvedValueOnce(0) // EXPIRING_SOON
        .mockResolvedValueOnce(0); // SUSPENDED
      mockPrisma.sale.aggregate.mockResolvedValue({
        _sum: { totalAmount: 500 },
        _count: 3,
      });
      mockPrisma.product.count.mockResolvedValue(2);
      mockPrisma.product.aggregate.mockResolvedValue({
        _sum: { currentStock: 20 },
      });
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.whatsAppMessage.count.mockResolvedValue(0);

      const result = await service.getKPIs();

      expect(result.totalCustomers).toBe(4);
      expect(result.activeSubscriptions).toBe(3);
      expect(result.expiringSubscriptions).toBe(0);
      expect(result.totalRevenue).toBe(500);
      expect(result.todaySalesCount).toBe(3);
      expect(result.inventory.totalProducts).toBe(2);
      expect(result.inventory.totalStock).toBe(20);
      expect(result.inventory.lowStock).toBe(0);
      expect(result.whatsapp.pendingMessages).toBe(0);
      expect(result.suspendedSubscriptions).toBe(0);
    });
  });

  describe('getRevenueChart', () => {
    it('should return revenue data grouped by period', async () => {
      mockPrisma.sale.findMany.mockResolvedValue([
        { totalAmount: 100, createdAt: new Date('2024-01-15T10:00:00Z') },
        { totalAmount: 200, createdAt: new Date('2024-01-20T10:00:00Z') },
        { totalAmount: 150, createdAt: new Date('2024-02-10T10:00:00Z') },
      ]);

      const result = await service.getRevenueChart('monthly');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ date: '2024-01', revenue: 300 });
      expect(result[1]).toEqual({ date: '2024-02', revenue: 150 });
    });
  });
});