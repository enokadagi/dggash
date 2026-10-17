import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountLockoutGuard } from '../guards/account-lockout.guard';
import { resolveLoginIdentifier } from '../utils/login-identifier';

/**
 * Cost of hashing a throwaway password. Comparing against this when the user
 * does not exist keeps the response time of "unknown user" and "wrong password"
 * indistinguishable, which prevents user enumeration by timing.
 */
const DUMMY_PASSWORD_HASH =
  '$2a$10$ec0A9LiCUmGVQokJ6W0X/uNclbBPeo3O9qtI6010YoettbjJKaTB2';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    private accountLockout: AccountLockoutGuard,
  ) {
    super({
      usernameField: 'identifier',
      passwordField: 'password',
    });
  }

  /**
   * Resolves the user by phone or email.
   *
   * `deletedAt: null` is required: `findUnique` alone would happily return a
   * soft-deleted account, which would otherwise keep full access to the system.
   */
  private async findUser(identifier: string) {
    const resolved = resolveLoginIdentifier(identifier);
    if (!resolved) return null;

    if (resolved.kind === 'email') {
      return this.prisma.user.findFirst({
        where: {
          email: { equals: resolved.candidates[0], mode: 'insensitive' },
          deletedAt: null,
        },
      });
    }

    return this.prisma.user.findFirst({
      where: { phone: { in: resolved.candidates }, deletedAt: null },
    });
  }

  async validate(identifier: string, password: string): Promise<any> {
    const resolved = resolveLoginIdentifier(identifier);
    const lockKey = resolved?.key ?? `raw:${String(identifier).toLowerCase()}`;

    const user = await this.findUser(identifier);

    if (!user) {
      this.accountLockout.recordFailure(lockKey);
      // Still perform a hash comparison so timing does not reveal whether the
      // account exists. The same generic error is always returned.
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Invalid phone/email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      this.accountLockout.recordFailure(lockKey);
      throw new UnauthorizedException('Invalid phone/email or password');
    }

    if (user.status !== 'ACTIVE') {
      // Password is checked first so an inactive account is not distinguishable
      // from a wrong password.
      this.accountLockout.resetAttempts(lockKey);
      throw new UnauthorizedException('Invalid phone/email or password');
    }

    this.accountLockout.resetAttempts(lockKey);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { passwordHash, ...result } = user;
    return result;
  }
}
