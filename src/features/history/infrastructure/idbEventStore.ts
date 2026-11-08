import type { AppDb } from '@/shared/infrastructure/db';
import type { AscendingQuery, EventFilter, EventPage, EventStore } from '../application/ports';
import { eventIdLowerBound, eventIdUpperBound, type HistoryEvent } from '../domain/event';

const DEFAULT_PAGE_SIZE = 50;

function matches(event: HistoryEvent, filter: EventFilter): boolean {
  if (filter.entity && event.entity !== filter.entity) return false;
  if (filter.entityId && event.entityId !== filter.entityId) return false;
  if (filter.user && event.user !== filter.user) return false;
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  return true;
}

export class IdbEventStore implements EventStore {
  constructor(private readonly db: AppDb) {}

  async append(events: readonly HistoryEvent[]): Promise<void> {
    if (events.length === 0) return;
    const tx = this.db.transaction('events', 'readwrite');
    await Promise.all([...events.map((event) => tx.store.put(event)), tx.done]);
  }

  async query(filter: EventFilter = {}, page: { limit?: number; cursor?: string | null } = {}): Promise<EventPage> {
    const limit = page.limit ?? DEFAULT_PAGE_SIZE;
    // Ids start with the padded timestamp, so the time window is a key range.
    const lower = filter.from === undefined ? undefined : eventIdLowerBound(filter.from);
    const upperTime = filter.to === undefined ? undefined : eventIdUpperBound(filter.to);
    const upperCursor = page.cursor ?? undefined;
    const range = this.range(lower, upperTime, upperCursor);
    if (range === null) return { events: [], nextCursor: null };

    const tx = this.db.transaction('events', 'readonly');
    const source = filter.entityId ? tx.store.index('entityId') : tx.store;
    const query = filter.entityId ? undefined : range;
    let cursor = await source.openCursor(filter.entityId ? IDBKeyRange.only(filter.entityId) : query, 'prev');
    const events: HistoryEvent[] = [];
    let hasMore = false;
    while (cursor) {
      const event = cursor.value;
      const inWindow =
        (lower === undefined || event.id >= lower) &&
        (upperTime === undefined || event.id < upperTime) &&
        (upperCursor === undefined || event.id < upperCursor);
      if (inWindow && matches(event, filter)) {
        if (events.length === limit) {
          hasMore = true;
          break;
        }
        events.push(event);
      }
      cursor = await cursor.continue();
    }
    const last = events[events.length - 1];
    return { events, nextCursor: hasMore && last ? last.id : null };
  }

  async listAscending(query: AscendingQuery = {}): Promise<HistoryEvent[]> {
    const lower = query.afterId;
    const upper = query.untilMs === undefined ? undefined : eventIdUpperBound(query.untilMs);
    let range: IDBKeyRange | undefined;
    if (lower !== undefined && upper !== undefined) {
      if (lower >= upper) return [];
      range = IDBKeyRange.bound(lower, upper, true, true);
    } else if (lower !== undefined) {
      range = IDBKeyRange.lowerBound(lower, true);
    } else if (upper !== undefined) {
      range = IDBKeyRange.upperBound(upper, true);
    }
    if (query.entity) {
      // The `entity` index is ordered by id inside one entity: read only that entity, then cut the window.
      const ofEntity = await this.db.getAllFromIndex('events', 'entity', query.entity);
      return ofEntity.filter((event) => (range ? range.includes(event.id) : true));
    }
    return this.db.getAll('events', range);
  }

  async listUsers(): Promise<string[]> {
    const users: string[] = [];
    let cursor = await this.db.transaction('events').store.index('user').openKeyCursor(null, 'nextunique');
    while (cursor) {
      users.push(cursor.key);
      cursor = await cursor.continue();
    }
    return users.sort();
  }

  first(): Promise<HistoryEvent | undefined> {
    return this.db.transaction('events').store.openCursor().then((cursor) => cursor?.value);
  }

  async lastId(): Promise<string> {
    const cursor = await this.db.transaction('events').store.openCursor(null, 'prev');
    return cursor?.value.id ?? '';
  }

  count(): Promise<number> {
    return this.db.count('events');
  }

  private range(lower: string | undefined, upperTime: string | undefined, cursor: string | undefined): IDBKeyRange | undefined | null {
    const uppers = [upperTime, cursor].filter((value): value is string => value !== undefined);
    const upper = uppers.length === 0 ? undefined : uppers.reduce((a, b) => (a < b ? a : b));
    if (lower !== undefined && upper !== undefined) {
      if (lower >= upper) return null;
      return IDBKeyRange.bound(lower, upper, false, true);
    }
    if (lower !== undefined) return IDBKeyRange.lowerBound(lower);
    if (upper !== undefined) return IDBKeyRange.upperBound(upper, true);
    return undefined;
  }
}
