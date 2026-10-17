import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config as loadEnv } from 'dotenv';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { SanitizePipe } from './common/pipes/sanitize.pipe';
import { validateEnv } from './common/config/env.validation';

async function bootstrap() {
  loadEnv();
  validateEnv();

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      hsts: { maxAge: 31536000, includeSubDomains: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(compression());
  app.use(morgan('combined'));

  // Behind nginx/Hostinger (and any other reverse proxy) `request.ip` would
  // otherwise be the proxy's address, which breaks audit log IPs, rate limiting
  // and lockouts. One hop is trusted because only our own proxy fronts the API.
  const trustProxy = configService.get('TRUST_PROXY', '1');
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', trustProxy === 'false' ? false : Number(trustProxy) || 1);

  app.enableCors({
    origin: configService
      .get('ALLOWED_ORIGINS', 'http://localhost:3000')
      .split(','),
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  app.getHttpAdapter().getInstance().get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
    new SanitizePipe(),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  if (configService.get('NODE_ENV') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('AWIK NET — Internet Service Provider')
      .setDescription('Core ISP Management System')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication')
      .addTag('customers', 'Customer management')
      .addTag('plans', 'Internet plans')
      .addTag('subscriptions', 'Customer subscriptions')
      .addTag('inventory', 'Inventory & products')
      .addTag('sales', 'Sales & POS')
      .addTag('whatsapp', 'WhatsApp automation')
      .addTag('dashboard', 'Dashboard')
      .addTag('settings', 'Settings')
      .addTag('reports', 'Reports')
      .addTag('backup', 'Backup')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get('PORT', 3001);
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);

  const shutdown = async (signal: string) => {
    logger.log(`${signal} received. Shutting down gracefully...`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
