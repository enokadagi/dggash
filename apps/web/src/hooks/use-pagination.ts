"use client";

import { useState, useCallback } from "react";

interface UsePaginationOptions {
  initialPage?: number;
  initialLimit?: number;
}

interface UsePaginationReturn {
  page: number;
  limit: number;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  offset: number;
}

export function usePagination({
  initialPage = 1,
  initialLimit = 20,
}: UsePaginationOptions = {}): UsePaginationReturn {
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);

  const nextPage = useCallback(() => setPage((p) => p + 1), []);
  const prevPage = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const offset = (page - 1) * limit;

  return { page, limit, setPage, setLimit, nextPage, prevPage, offset };
}
