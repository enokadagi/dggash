import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const failedAttempts = new Map<string, { count: number; lastAttempt: Date }>();

@Injectable()
export class AccountLockoutGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { phone } = request.body || {};

    if (!phone) return true;

    const record = failedAttempts.get(phone);
    if (record) {
      if (record.count >= MAX_ATTEMPTS) {
        const timeSinceLastAttempt = Date.now() - record.lastAttempt.getTime();
        if (timeSinceLastAttempt < LOCKOUT_DURATION_MS) {
          const remainingSeconds = Math.ceil(
            (LOCKOUT_DURATION_MS - timeSinceLastAttempt) / 1000,
          );
          throw new UnauthorizedException(
            `Account locked. Try again in ${remainingSeconds} seconds.`,
          );
        }
        failedAttempts.delete(phone);
      }
    }
    return true;
  }

  recordFailure(phone: string) {
    const record = failedAttempts.get(phone) || { count: 0, lastAttempt: new Date() };
    record.count++;
    record.lastAttempt = new Date();
    failedAttempts.set(phone, record);
  }

  resetAttempts(phone: string) {
    failedAttempts.delete(phone);
  }
}
