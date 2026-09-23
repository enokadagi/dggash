import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountLockoutGuard } from '../guards/account-lockout.guard';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    private accountLockout: AccountLockoutGuard,
  ) {
    super({
      usernameField: 'phone',
      passwordField: 'password',
    });
  }

  async validate(phone: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { phone },
    });

    if (!user) {
      this.accountLockout.recordFailure(phone);
      throw new UnauthorizedException('Invalid phone or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      this.accountLockout.recordFailure(phone);
      throw new UnauthorizedException('Invalid phone or password');
    }

    this.accountLockout.resetAttempts(phone);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { passwordHash, ...result } = user;
    return result;
  }
}
