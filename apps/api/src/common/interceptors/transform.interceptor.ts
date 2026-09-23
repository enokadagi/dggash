import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface WrappedResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, WrappedResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): any {
    return (next.handle() as any).pipe(
      map((data) => {
        if (data === null || data === undefined) {
          return { success: true, data: data as T };
        }

        if (
          typeof data === 'object' &&
          data !== null &&
          'data' in data &&
          'meta' in data &&
          'success' in data
        ) {
          return data;
        }

        if (
          typeof data === 'object' &&
          data !== null &&
          'data' in data &&
          'meta' in data &&
          !('success' in data)
        ) {
          return { success: true, ...data } as WrappedResponse<T>;
        }

        return { success: true, data };
      }),
    );
  }
}
