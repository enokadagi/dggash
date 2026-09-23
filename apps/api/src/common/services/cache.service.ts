import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

interface CacheEntry {
  value: any;
  expiresAt: number;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private cache = new Map<string, CacheEntry>();
  private readonly defaultTTL = 60000;

  constructor() {
    const id = setInterval(() => this.cleanup(), 30000);
    // Prevent the interval from keeping the Node.js event loop alive (useful in tests)
    if (typeof (id as any)?.unref === 'function') {
      (id as any).unref();
    }
  }

  private cleanup() {
    const now = Date.now();
    let cleaned = 0;
    this.cache.forEach((entry, key) => {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        cleaned++;
      }
    });
    if (cleaned > 0) {
      this.logger.debug(`Cleaned ${cleaned} expired cache entries`);
    }
  }

  private makeKey(prefix: string, params: Record<string, any>): string {
    const sorted = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {} as Record<string, any>);
    const hash = crypto.createHash('md5').update(JSON.stringify(sorted)).digest('hex').slice(0, 12);
    return `${prefix}:${hash}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set(key: string, value: any, ttlMs?: number): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs || this.defaultTTL),
    });
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await factory();
    await this.set(key, value, ttlMs);
    return value;
  }

  async invalidate(pattern: string): Promise<void> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    let cleaned = 0;
    this.cache.forEach((_, key) => {
      if (regex.test(key)) {
        this.cache.delete(key);
        cleaned++;
      }
    });
    this.logger.debug(`Invalidated ${cleaned} cache entries matching ${pattern}`);
  }

  async invalidatePrefix(prefix: string): Promise<void> {
    let cleaned = 0;
    this.cache.forEach((_, key) => {
      if (key.startsWith(prefix + ':')) {
        this.cache.delete(key);
        cleaned++;
      }
    });
    this.logger.debug(`Invalidated ${cleaned} cache entries for prefix ${prefix}`);
  }

  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  private makeKeyFn(prefix: string) {
    return (params: Record<string, any>) => this.makeKey(prefix, params);
  }
}
