import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const body = exceptionResponse as { message?: unknown; errors?: unknown };
        const raw = body.message ?? body.errors;

        if (Array.isArray(raw)) {
          // class-validator reports an array of constraint failures.
          message = 'Validation failed';
          errors = raw;
        } else if (typeof raw === 'string' && raw) {
          message = raw;
          errors = body.errors ?? null;
        } else {
          errors = body.errors ?? null;
        }
      }
    } else if (exception instanceof Error) {
      // Unexpected errors must never expose internals to the client; the full
      // error (message + stack) is logged server side only.
      this.logger.error(
        `${request.method} ${request.url} failed: ${exception.message}`,
        exception.stack,
      );
      message = process.env.NODE_ENV === 'production' ? 'Internal server error' : exception.message;
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      errors,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
