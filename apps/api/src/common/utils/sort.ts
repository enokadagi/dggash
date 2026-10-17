/**
 * Guards dynamic Prisma `orderBy` fields.
 *
 * `sortBy` arrives from the query string, so it must be checked against an
 * allowlist before being used as an object key, otherwise any value produces
 * an unhandled Prisma error (500) and unexpected columns can be targeted.
 */
export function resolveSortField<T extends string>(
  requested: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return requested && (allowed as readonly string[]).includes(requested)
    ? (requested as T)
    : fallback;
}

export function resolveSortOrder(requested: string | undefined): 'asc' | 'desc' {
  return requested === 'asc' ? 'asc' : 'desc';
}

/** Builds a safe `orderBy` object for Prisma. */
export function safeOrderBy<T extends string>(
  requested: string | undefined,
  allowed: readonly T[],
  fallback: T,
  requestedOrder?: string,
): Record<string, 'asc' | 'desc'> {
  return { [resolveSortField(requested, allowed, fallback)]: resolveSortOrder(requestedOrder) };
}
