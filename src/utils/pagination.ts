import type { PaginationMeta } from '@taaj/shared';

export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export function getSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}
