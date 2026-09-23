import * as crypto from 'crypto';

export interface CursorPaginationInput {
  cursor?: string;
  limit?: number;
}

export interface CursorPaginationResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function encodeCursor(data: Record<string, any>): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

export function decodeCursor(cursor: string): Record<string, any> {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString());
  } catch {
    throw new Error('Invalid cursor');
  }
}

export async function cursorPaginate<T extends { id: string }>(
  findMany: (args: { cursor?: { id: string }; take: number; skip?: number }) => Promise<T[]>,
  count: () => Promise<number>,
  input: CursorPaginationInput,
  additionalCursorWhere?: (cursor: Record<string, any>) => any,
): Promise<CursorPaginationResult<T>> {
  const limit = Math.min(input.limit || 20, 100);
  const take = limit + 1;

  const args: any = { take };

  if (input.cursor) {
    const decoded = decodeCursor(input.cursor);
    args.cursor = { id: decoded.id };
    args.skip = 1;
  }

  if (additionalCursorWhere) {
    args.where = additionalCursorWhere(input.cursor ? decodeCursor(input.cursor) : {});
  }

  const results = await findMany(args);
  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const nextCursor = hasMore ? encodeCursor({ id: data[data.length - 1].id }) : null;

  return { data, nextCursor, hasMore };
}
