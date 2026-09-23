import { Logger } from '@nestjs/common';

export interface RetryOptions {
  maxRetries?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  logger?: Logger;
  context?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 5,
    delayMs = 100,
    backoffMultiplier = 2,
    logger,
    context = 'operation',
  } = options;

  let lastError: Error | undefined;
  let retries = maxRetries;

  while (retries > 0) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      retries--;
      if (retries > 0) {
        const delay = delayMs * Math.pow(backoffMultiplier, maxRetries - retries - 1);
        logger?.warn(`${context} failed, retrying in ${delay}ms (${retries} retries left): ${lastError.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Retry specifically for Prisma P2002 unique constraint violations.
 * Uses the provided async function to generate a unique value.
 */
export async function generateWithRetry<T>(
  generateFn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  return withRetry(generateFn, { ...options, context: options.context || 'unique generation' });
}
