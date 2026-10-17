import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { extractLoginIdentifier } from '../utils/login-identifier';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  /**
   * Normalises the credential field before passport reads it.
   *
   * Guards execute before pipes, so the `ValidationPipe` and `LoginDto` have not
   * run yet and passport-local would otherwise only see the raw body. Writing a
   * canonical `identifier` here means the strategy always receives a normalised
   * value, and the legacy `phone` / `email` body fields keep working for older
   * clients without needing a second code path.
   */
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const body = request?.body;

    if (body && typeof body === 'object') {
      const resolved = extractLoginIdentifier(body);
      if (resolved) {
        body.identifier = resolved.candidates[0];
        request.loginIdentifier = resolved;
      }
    }

    return super.canActivate(context);
  }
}
