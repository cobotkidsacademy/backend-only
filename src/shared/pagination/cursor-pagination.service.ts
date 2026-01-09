import { Injectable } from '@nestjs/common';

/**
 * Cursor-Based Pagination Service
 * 
 * Benefits over offset-based pagination:
 * - No performance degradation with large datasets
 * - Consistent results even if data changes
 * - Minimal database load
 */
@Injectable()
export class CursorPaginationService {
  /**
   * Encode cursor from last item
   */
  encodeCursor(id: string, timestamp?: string): string {
    const data = { id, timestamp: timestamp || new Date().toISOString() };
    return Buffer.from(JSON.stringify(data)).toString('base64');
  }

  /**
   * Decode cursor to get last item info
   */
  decodeCursor(cursor: string): { id: string; timestamp: string } | null {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch (error) {
      return null;
    }
  }

  /**
   * Build pagination response
   */
  buildResponse<T>(
    data: T[],
    limit: number,
    cursor?: string,
  ): {
    data: T[];
    next_cursor?: string;
    has_more: boolean;
    limit: number;
  } {
    const hasMore = data.length > limit;
    const items = hasMore ? data.slice(0, limit) : data;

    let nextCursor: string | undefined;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1] as any;
      nextCursor = this.encodeCursor(
        lastItem.id || lastItem.uuid || '',
        lastItem.created_at || lastItem.updated_at,
      );
    }

    return {
      data: items,
      next_cursor: nextCursor,
      has_more: hasMore,
      limit,
    };
  }

  /**
   * Get pagination parameters from query
   */
  getPaginationParams(query: {
    limit?: string;
    cursor?: string;
  }): {
    limit: number;
    cursor?: { id: string; timestamp: string };
  } {
    const limit = Math.min(parseInt(query.limit || '20', 10), 100); // Max 100 items
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;

    return { limit, cursor };
  }
}
