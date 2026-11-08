import { useEffect, useState } from 'react';
import type { SyncMessage } from '@/shared/infrastructure/syncChannel';
import { Button } from '@/shared/ui/Button';
import { formatInstant } from '@/shared/ui/format';
import { useServices } from './AppServicesProvider';

const ENTITY_TEXT: Record<string, string> = {
  order: 'un pedido',
  recipe: 'una receta',
  settings: 'los ajustes',
  menu: 'el menú de una semana',
  plan: 'el plan',
};

export function describeRemoteChange(message: SyncMessage): string {
  if (message.type === 'reset') return 'Otra pestaña restauró los datos de ejemplo';
  const what = ENTITY_TEXT[message.entity] ?? 'los datos';
  return message.type === 'conflict'
    ? `Otra pestaña cambió ${what} y hubo un conflicto: revisá el Historial`
    : `Otra pestaña cambió ${what}`;
}

interface Toast {
  id: number;
  text: string;
}

const TOAST_MS = 8000;

/** Toasts for the messages other tabs send, plus the sync indicator state. */
export function useRemoteChanges(): { toasts: Toast[]; dismiss(id: number): void; lastRemoteAt: number | null } {
  const { bus, clock } = useServices();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastRemoteAt, setLastRemoteAt] = useState<number | null>(null);

  useEffect(() => {
    let next = 1;
    return bus.subscribe((message) => {
      const id = next++;
      setToasts((list) => [...list, { id, text: describeRemoteChange(message) }]);
      setLastRemoteAt(clock());
      setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), TOAST_MS);
    });
  }, [bus, clock]);

  return { toasts, dismiss: (id) => setToasts((list) => list.filter((t) => t.id !== id)), lastRemoteAt };
}

export function ToastRegion({ toasts, dismiss }: { toasts: Toast[]; dismiss(id: number): void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed inset-x-4 top-20 z-50 flex flex-col gap-2 md:left-auto md:right-4 md:w-96" data-testid="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} role="status" className="flex items-center justify-between gap-3 rounded border-2 border-navy bg-white p-3 shadow-lg">
          <span className="font-semibold">{toast.text}</span>
          <Button className="min-h-9 px-2 py-1 text-sm" onClick={() => dismiss(toast.id)}>
            Cerrar
          </Button>
        </div>
      ))}
    </div>
  );
}

export function SyncIndicator({ lastRemoteAt }: { lastRemoteAt: number | null }) {
  return (
    <p className="flex items-center gap-2 text-sm" data-testid="sync-indicator">
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-ok" />
      <span>Sincronizado</span>
      {lastRemoteAt !== null && <span className="hidden text-white/70 sm:inline">· otra pestaña {formatInstant(lastRemoteAt).slice(11)}</span>}
    </p>
  );
}
