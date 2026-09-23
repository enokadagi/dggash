import { CacheService } from './cache.service';

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(() => {
    service = new CacheService();
  });

  afterEach(() => {
    service['cache'].clear();
  });

  describe('set and get', () => {
    it('should store and retrieve a value', async () => {
      await service.set('test:key', { foo: 'bar' });
      const result = await service.get('test:key');
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should return null for missing key', async () => {
      const result = await service.get('missing:key');
      expect(result).toBeNull();
    });

    it('should return null for expired entry', async () => {
      await service.set('test:expired', 'value', 1); // 1ms TTL
      await new Promise(resolve => setTimeout(resolve, 10));
      const result = await service.get('test:expired');
      expect(result).toBeNull();
    });
  });

  describe('getOrSet', () => {
    it('should call factory on cache miss', async () => {
      const factory = jest.fn().mockResolvedValue('computed');
      const result = await service.getOrSet('test:factory', factory);
      expect(result).toBe('computed');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should not call factory on cache hit', async () => {
      await service.set('test:cached', 'existing');
      const factory = jest.fn().mockResolvedValue('new');
      const result = await service.getOrSet('test:cached', factory);
      expect(result).toBe('existing');
      expect(factory).not.toHaveBeenCalled();
    });
  });

  describe('invalidatePrefix', () => {
    it('should remove all keys with matching prefix', async () => {
      await service.set('prefix:a', 1);
      await service.set('prefix:b', 2);
      await service.set('other:c', 3);
      await service.invalidatePrefix('prefix');
      expect(await service.get('prefix:a')).toBeNull();
      expect(await service.get('prefix:b')).toBeNull();
      expect(await service.get('other:c')).toBe(3);
    });
  });

  describe('getStats', () => {
    it('should return cache stats', async () => {
      await service.set('a', 1);
      await service.set('b', 2);
      const stats = service.getStats();
      expect(stats.size).toBe(2);
      expect(stats.keys).toContain('a');
      expect(stats.keys).toContain('b');
    });
  });
});
