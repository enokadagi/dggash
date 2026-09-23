import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from '../../common/strategies/jwt.strategy';
import { LocalStrategy } from '../../common/strategies/local.strategy';
import { AccountLockoutGuard } from '../../common/guards/account-lockout.guard';
import { LocalAuthGuard } from '../../common/guards/local-auth.guard';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    AuditModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: configService.get('JWT_EXPIRES_IN', '24h') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy, AccountLockoutGuard, LocalAuthGuard],
  exports: [AuthService, AccountLockoutGuard],
})
export class AuthModule {}