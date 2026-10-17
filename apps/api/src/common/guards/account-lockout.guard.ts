import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { extractLoginIdentifier } from '../utils/login-identifier';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;
const MAX_TRACKED_KEYS = 10_000;

interface AttemptRecord {
  count: number;
  lastAttempt: number;
}

/**
 * In-process brute-force protection for the login endpoint.
 *
 * State is intentionally process-local (no schema change required), but the map
 * is bounded and swept so it cannot grow without limit, and lockouts still
 * survive briefly across requests within a single running instance.
 *
 * The state is `static` on purpose: the guard is referenced both by
 * `@UseGuards(...)` on the controller and by constructor injection into
 * `LocalStrategy`, and those two references are not guaranteed to resolve to
 * the same instance. Shared static state keeps the counter consistent.
 */
@Injectable()
export class AccountLockoutGuard implements CanActivate {
  private static readonly failedAttempts = new Map<string, AttemptRecord>();
  private static lastSweep = Date.now();

  private get failedAttempts(): Map<string, AttemptRecord> {
    return AccountLockoutGuard.failedAttempts;
  }

  canActivate(context: ExecutionContext): boolean {
    AccountLockoutGuard.sweep();

    const request = context.switchToHttp().getRequest();
    const key = this.resolveKey(request?.body);
    if (!key) return true;

    const record = this.failedAttempts.get(key);
    if (!record) return true;

    const timeSinceLastAttempt = Date.now() - record.lastAttempt;
    if (timeSinceLastAttempt >= LOCKOUT_DURATION_MS) {
      this.failedAttempts.delete(key);
      return true;
    }

    if (record.count >= MAX_ATTEMPTS) {
      const remainingSeconds = Math.ceil((LOCKOUT_DURATION_MS - timeSinceLastAttempt) / 1000);
      throw new UnauthorizedException(
        `Account locked. Try again in ${remainingSeconds} seconds.`,
      );
    }

    return true;
  }

  /**
   * Derives the lockout key from the login body.
   *
   * The key is derived the same way in `LocalStrategy`, so the counter that
   * blocks a request and the counter that increments it always agree — even
   * though this guard runs first and cannot see the identifier that
   * `LocalAuthGuard` normalises onto the request.
   */
  private resolveKey(body: unknown): string | null {
    return extractLoginIdentifier(body)?.key ?? null;
  }

  recordFailure(key: string): void {
    if (!key) return;

    AccountLockoutGuard.sweep();

    const record = this.failedAttempts.get(key);
    if (record) {
      record.count += 1;
      record.lastAttempt = Date.now();
    } else {
      this.evictIfFull();
      this.failedAttempts.set(key, { count: 1, lastAttempt: Date.now() });
    }
  }

  resetAttempts(key: string): void {
    if (key) this.failedAttempts.delete(key);
  }

  /** Drops expired records and caps the map size to prevent unbounded growth. */
  private static sweep(): void {
    const now = Date.now();
    if (now - AccountLockoutGuard.lastSweep < SWEEP_INTERVAL_MS) return;
    AccountLockoutGuard.lastSweep = now;

    for (const [key, record] of AccountLockoutGuard.failedAttempts) {
      if (now - record.lastAttempt >= LOCKOUT_DURATION_MS) {
        AccountLockoutGuard.failedAttempts.delete(key);
      }
    }
  }

  private evictIfFull(): void {
    if (this.failedAttempts.size < MAX_TRACKED_KEYS) return;

    // Evict the least recently attempted entries.
    const entries = [...this.failedAttempts.entries()].sort(
      (a, b) => a[1].lastAttempt - b[1].lastAttempt,
    );
    const overflow = this.failedAttempts.size - MAX_TRACKED_KEYS + 1;
    for (let i = 0; i < overflow; i += 1) {
      this.failedAttempts.delete(entries[i][0]);
    }
  }
}
