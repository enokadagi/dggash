import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'passwordhash',
  'accesstoken',
  'refreshtoken',
  'token',
  'secret',
  'apitoken',
  'authorization',
]);

/** Strips credentials from a body before it is persisted in the audit log. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      output[key] = '[redacted]';
    } else {
      output[key] = redact(item, depth + 1);
    }
  }
  return output;
}

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
            const safeBody = redact(body ?? {});
            await this.prisma.auditLog
              .create({
                data: {
                  userId,
                  action,
                  entity: this.extractEntityType(url),
                  entityId: (response?.id || response?.data?.id || response?.result?.id) as string,
                  newValues:
                    safeBody && Object.keys(safeBody as object).length > 0
                      ? JSON.stringify(safeBody)
                      : null,
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
    const segments = url.split('?')[0].split('/').filter(Boolean);
    // URLs are prefixed with `api/v1`, so skip the version segment and take
    // the first real resource segment (e.g. /api/v1/customers -> customers).
    const resourceIndex = segments.findIndex(
      (segment) => segment !== 'api' && !/^v\d+$/i.test(segment),
    );
    const resource = resourceIndex >= 0 ? segments[resourceIndex] : undefined;
    if (!resource) return 'unknown';
    return resource.charAt(0).toUpperCase() + resource.slice(1);
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