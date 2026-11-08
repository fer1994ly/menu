import { useState } from 'react';
import { UndoControls, useUndoState } from '@/app/UndoControls';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Field, INPUT_CLASS } from '@/shared/ui/Field';
import { Notice } from '@/shared/ui/Notice';
import type { EventFilter } from '../application/ports';
import type { EventEntity } from '../domain/event';
import { EventsList } from './EventsList';
import { StateAtPanel } from './StateAtPanel';
import { ENTITY_LABELS, toEntityId } from './eventText';
import { useHistoryEvents, useHistoryUsers } from './useHistoryEvents';

export function HistoryScreen() {
  const [entity, setEntity] = useState<'' | EventEntity>('');
  const [user, setUser] = useState('');
  const [code, setCode] = useState('');
  const undo = useUndoState();
  const { data: users } = useHistoryUsers();

  const entityId = toEntityId(code);
  const filter: EventFilter = {
    ...(entity ? { entity } : {}),
    ...(user ? { user } : {}),
    ...(entityId ? { entityId } : {}),
  };
  const { events, hasMore, loadMore, loadingMore, loading, error } = useHistoryEvents(filter);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Historial</h2>

      <Card title="Deshacer y rehacer" data-testid="history-undo">
        <p className="mb-2 tabular" data-testid="undo-depth">
          Pasos para deshacer: {undo.undoDepth} de {undo.maxSteps} · para rehacer: {undo.redoDepth}
        </p>
        <UndoControls />
      </Card>

      <StateAtPanel />

      <Card title="Cambios registrados">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tipo">
            {(c) => (
              <select {...c} className={INPUT_CLASS} value={entity} onChange={(e) => setEntity(e.target.value as '' | EventEntity)}>
                <option value="">Todos</option>
                {(Object.keys(ENTITY_LABELS) as EventEntity[]).map((key) => (
                  <option key={key} value={key}>
                    {ENTITY_LABELS[key]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Usuario">
            {(c) => (
              <select {...c} className={INPUT_CLASS} value={user} onChange={(e) => setUser(e.target.value)}>
                <option value="">Todos</option>
                {(users ?? []).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Pedido o receta" hint="Por ejemplo P-000123 o R1">
            {(c) => <input {...c} className={INPUT_CLASS} value={code} onChange={(e) => setCode(e.target.value)} />}
          </Field>
        </div>
        <div className="mt-4">
          {error && <Notice tone="error">{error}</Notice>}
          {!loading && events.length === 0 && <EmptyState message="Todavía no hay cambios registrados con estos filtros" />}
          {events.length > 0 && <EventsList events={events} />}
          {hasMore && (
            <Button className="mt-3" disabled={loadingMore} onClick={() => void loadMore()}>
              Cargar más
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
