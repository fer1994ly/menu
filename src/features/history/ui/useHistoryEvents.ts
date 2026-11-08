import { useState } from 'react';
import { useServices } from '@/app/AppServicesProvider';
import { useLiveData } from '@/shared/ui/liveData';
import type { EventFilter } from '../application/ports';
import type { HistoryEvent } from '../domain/event';

const PAGE_SIZE = 50;

/** Container hook: newest-first events, one page at a time («Cargar más»). */
export function useHistoryEvents(filter: EventFilter) {
  const { repos } = useServices();
  const filterKey = JSON.stringify(filter);
  const first = useLiveData(() => repos.events.query(filter, { limit: PAGE_SIZE }), [filterKey]);
  const [more, setMore] = useState<{ key: string; events: HistoryEvent[]; cursor: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const key = `${filterKey}:${first.data?.events[0]?.id ?? ''}`;
  const extra = more?.key === key ? more : null;
  const events = [...(first.data?.events ?? []), ...(extra?.events ?? [])];
  const cursor = extra ? extra.cursor : (first.data?.nextCursor ?? null);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await repos.events.query(filter, { limit: PAGE_SIZE, cursor });
      setMore({ key, events: [...(extra?.events ?? []), ...page.events], cursor: page.nextCursor });
    } finally {
      setLoadingMore(false);
    }
  };

  return { events, hasMore: cursor !== null, loadMore, loadingMore, loading: first.loading, error: first.error };
}

/** Users that appear in the history, for the filter. */
export function useHistoryUsers() {
  const { repos } = useServices();
  return useLiveData(() => repos.events.listUsers(), []);
}
