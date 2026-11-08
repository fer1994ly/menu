import type { EventEntity, EventKind, HistoryEvent } from '../domain/event';
import type { StateSnapshot } from '../domain/snapshot';

export interface EventFilter {
  entity?: EventEntity;
  entityId?: string;
  user?: string;
  kinds?: readonly EventKind[];
  /** Epoch ms, inclusive. */
  from?: number;
  /** Epoch ms, inclusive. */
  to?: number;
}

export interface EventPage {
  /** Newest first. */
  events: HistoryEvent[];
  /** Pass back as `cursor` for the next page; null when there is no more. */
  nextCursor: string | null;
}

export interface AscendingQuery {
  /** Only events with an id strictly greater than this one. */
  afterId?: string;
  /** Only events at or before this instant (epoch ms). */
  untilMs?: number;
  entity?: EventEntity;
}

export interface EventStore {
  append(events: readonly HistoryEvent[]): Promise<void>;
  /** Cursor pagination, newest first. */
  query(filter?: EventFilter, page?: { limit?: number; cursor?: string | null }): Promise<EventPage>;
  /** Chronological order, for replay. */
  listAscending(query?: AscendingQuery): Promise<HistoryEvent[]>;
  /** Distinct users that appear in the log, sorted. */
  listUsers(): Promise<string[]>;
  first(): Promise<HistoryEvent | undefined>;
  lastId(): Promise<string>;
  count(): Promise<number>;
}

export interface SnapshotStore {
  put(snapshot: StateSnapshot): Promise<void>;
  get(id: string): Promise<StateSnapshot | undefined>;
  /** Latest snapshot whose `takenAt` is ≤ the instant. */
  latestAtOrBefore(atMs: number): Promise<StateSnapshot | undefined>;
  count(): Promise<number>;
}
