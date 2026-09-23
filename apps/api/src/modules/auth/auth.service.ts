import { Injectable, UnauthorizedException, BadRequestException, Logger, ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as crypto from 'crypto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
  ) {}

  async login(user: any, ip?: string, userAgent?: string) {
    const freshUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!freshUser || freshUser.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    await this.prisma.user.update({
      where: { id: freshUser.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(freshUser.id, freshUser.role);

    await this.auditService.logLogin(freshUser.id, ip || 'unknown', userAgent || 'unknown');

    return {
      user: this.sanitizeUser(freshUser),
      ...tokens,
    };
  }

  async refreshToken(dto: RefreshTokenDto) {
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) throw new Error('JWT_REFRESH_SECRET environment variable is required');

    try {
      const payload = this.jwtService.verify(dto.refreshToken, {
        secret: refreshSecret,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const tokens = await this.generateTokens(user.id, user.role);
      return { user: this.sanitizeUser(user), ...tokens };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async demoLogin(ip?: string, userAgent?: string) {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const demoEnabled = this.configService.get('DEMO_LOGIN_ENABLED') === 'true';
    if (isProduction && !demoEnabled) {
      throw new ForbiddenException('Demo login is disabled in production');
    }

    const demoPhone = '+1000000000';
    let demo = await this.prisma.user.findUnique({ where: { phone: demoPhone } });

    if (!demo) {
      const passwordHash = await bcrypt.hash('SuperAdmin123!', 12);
      demo = await this.prisma.user.create({
        data: {
          phone: demoPhone,
          email: 'demo@awiknet.example',
          firstName: 'Demo',
          lastName: 'Administrator',
          passwordHash,
          role: UserRole.ADMIN,
          status: 'ACTIVE',
        },
      });
      this.logger.log(`Demo account created (${demoPhone})`);
    }

    return this.login(demo, ip, userAgent);
  }

  async logout(userId: string, ip?: string, userAgent?: string) {
    await this.auditService.log({
      userId,
      action: 'LOGOUT',
      entity: 'User',
      entityId: userId,
      ipAddress: ip || null,
      userAgent: userAgent || null,
    });

    return { message: 'Logged out successfully' };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async updateProfile(userId: string, dto: { firstName?: string; lastName?: string; email?: string }) {
    const updateData: Record<string, unknown> = {};
    if (dto.firstName !== undefined) updateData.firstName = dto.firstName;
    if (dto.lastName !== undefined) updateData.lastName = dto.lastName;
    if (dto.email !== undefined) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email already in use');
      }
      updateData.email = dto.email;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    return updated;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await this.auditService.log({
      userId,
      action: 'UPDATE',
      entity: 'User',
      entityId: userId,
    });

    return { message: 'Password changed successfully' };
  }

  private sanitizeUser(user: any) {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt?.toISOString() || null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private async generateTokens(userId: string, role: string) {
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();
    const accessPayload = { sub: userId, role, jti: accessJti };
    const refreshPayload = { sub: userId, role, jti: refreshJti };

    const accessSecret = this.configService.get<string>('JWT_SECRET');
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!accessSecret || !refreshSecret) {
      throw new Error('JWT_SECRET and JWT_REFRESH_SECRET environment variables are required');
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: accessSecret,
        expiresIn: this.configService.get('JWT_EXPIRES_IN', '24h'),
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: refreshSecret,
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }
}