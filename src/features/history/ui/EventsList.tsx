import { Badge } from '@/shared/ui/Badge';
import { formatInstant } from '@/shared/ui/format';
import type { HistoryEvent } from '../domain/event';
import { entityName, fieldText, isConflictMarker, KIND_LABELS, valueText } from './eventText';

/** Presentational list: conflict events are highlighted and show the notice with both values. */
export function EventsList({ events }: { events: HistoryEvent[] }) {
  return (
    <ul className="divide-y divide-navy/10 rounded border border-navy/20">
      {events.map((event) => {
        const conflict = event.kind === 'conflict';
        const marker = isConflictMarker(event);
        return (
          <li
            key={event.id}
            data-testid={marker ? 'history-conflict' : 'history-event'}
            data-kind={event.kind}
            className={`flex flex-col gap-1 px-3 py-2 ${conflict ? 'border-l-8 border-error bg-error/10' : ''}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{entityName(event)}</span>
              <span className="tabular text-sm">{formatInstant(Date.parse(event.at))}</span>
            </div>
            {marker ? (
              <p className="font-semibold text-error">{String(event.meta?.['notice'] ?? 'Conflicto entre pestañas')}</p>
            ) : (
              <p className="tabular">
                <span className="font-semibold">{fieldText(event)}</span>: {valueText(event.oldValue)} → {valueText(event.newValue)}
              </p>
            )}
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={conflict ? 'warning' : 'neutral'}>{KIND_LABELS[event.kind]}</Badge>
              <span>{event.user}</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
