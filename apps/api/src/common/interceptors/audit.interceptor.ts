import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, user } = request;

    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next.handle();
    }

    const action = this.mapMethodToAction(method);

    return (next.handle() as any).pipe(
      tap({
        next: async (response: any) => {
          try {
            const userId = user?.id;
            if (!userId) return;
            await this.prisma.auditLog
              .create({
                data: {
                  userId,
                  action,
                  entity: this.extractEntityType(url),
                  entityId: (response?.id || response?.data?.id || response?.result?.id) as string,
                  newValues: JSON.stringify(body),
                  ipAddress: request.ip,
                  userAgent: request.headers['user-agent'] as string,
                },
              })
              .catch(() => {
                // Silently fail - audit shouldn't break the API
              });
          } catch (error) {
            this.logger.debug(`Audit log failed: ${(error as Error).message}`);
          }
        },
        error: async () => {
          // Don't audit errors to avoid noise
        },
      }),
    );
  }

  private extractEntityType(url: string): string {
    const segments = url.split('/').filter(Boolean);
    return segments[1] || 'unknown';
  }

  private mapMethodToAction(method: string): 'CREATE' | 'UPDATE' | 'DELETE' {
    const map: Record<string, 'CREATE' | 'UPDATE' | 'DELETE'> = {
      POST: 'CREATE',
      PUT: 'UPDATE',
      PATCH: 'UPDATE',
      DELETE: 'DELETE',
    };
    return map[method] || 'UPDATE';
  }
}