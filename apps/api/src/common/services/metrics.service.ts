import { Injectable } from '@nestjs/common';

interface EndpointMetric {
  count: number;
  totalTime: number;
  errors: number;
  minTime: number;
  maxTime: number;
}

@Injectable()
export class MetricsService {
  private metrics = new Map<string, EndpointMetric>();
  private readonly startTime = Date.now();

  recordRequest(method: string, path: string, status: number, duration: number) {
    const key = `${method} ${path} [${status}]`;
    const existing = this.metrics.get(key) || { count: 0, totalTime: 0, errors: 0, minTime: Infinity, maxTime: 0 };
    existing.count++;
    existing.totalTime += duration;
    existing.minTime = Math.min(existing.minTime, duration);
    existing.maxTime = Math.max(existing.maxTime, duration);
    if (status >= 400) existing.errors++;
    this.metrics.set(key, existing);
  }

  getMetrics() {
    const results: any[] = [];
    this.metrics.forEach((value, key) => {
      const match = key.match(/^(GET|POST|PUT|PATCH|DELETE) (.+) \[(.+)\]$/);
      if (!match) return;
      results.push({
        method: match[1],
        path: match[2],
        status: match[3],
        count: value.count,
        avgResponseTime: Math.round(value.totalTime / value.count),
        minResponseTime: value.minTime,
        maxResponseTime: value.maxTime,
        errors: value.errors,
      });
    });
    return {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      totalRequests: results.reduce((sum, r) => sum + r.count, 0),
      totalErrors: results.reduce((sum, r) => sum + r.errors, 0),
      endpoints: results.sort((a, b) => b.count - a.count).slice(0, 50),
    };
  }

  reset() {
    this.metrics.clear();
  }
}
