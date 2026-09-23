import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from '../services/metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): any {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method } = request;
    const path = request.route?.path || request.url;
    const start = Date.now();

    return (next.handle() as any).pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          this.metricsService.recordRequest(method, path, response.statusCode, duration);
        },
        error: () => {
          const duration = Date.now() - start;
          this.metricsService.recordRequest(method, path, response.statusCode || 500, duration);
        },
      }),
    );
  }
}
