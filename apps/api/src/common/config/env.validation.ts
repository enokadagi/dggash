import { Logger } from '@nestjs/common';

const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY'];

const optionalEnvVars = [
  'PORT',
  'NODE_ENV',
  'ALLOWED_ORIGINS',
  'THROTTLE_TTL',
  'THROTTLE_LIMIT',
  'WHATSAPP_API_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_BUSINESS_ACCOUNT_ID',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'WHATSAPP_API_VERSION',
  'WHATSAPP_APP_SECRET',
  'BACKUP_DIR',
  'BACKUP_RESTORE_TOKEN_TTL',
  'BACKUP_RETENTION_DAYS',
];

const optionalSensitiveEnvVars = ['WHATSAPP_API_TOKEN'];

export function validateEnv(): void {
  const logger = new Logger('EnvValidation');
  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    logger.error('Set these variables before starting the application.');
    process.exit(1);
  }
  logger.log('Environment variables validated');

  const configuredOptionals = optionalEnvVars.filter((key) => process.env[key]);
  const missingOptionals = optionalEnvVars.filter(
    (key) => !process.env[key] && !optionalSensitiveEnvVars.includes(key),
  );
  if (configuredOptionals.length > 0) {
    logger.log(`Optional env vars configured: ${configuredOptionals.join(', ')}`);
  }
  if (missingOptionals.length > 0) {
    logger.warn(`Optional env vars not configured: ${missingOptionals.join(', ')}`);
  }
}