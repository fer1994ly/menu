import { useEffect, useState } from 'react';
import type { UndoState } from '@/features/history/application/ChangeService';
import { Button } from '@/shared/ui/Button';
import { useServices } from './AppServicesProvider';

/** Live undo / redo state of this tab. */
export function useUndoState(): UndoState {
  const { changes } = useServices();
  const [state, setState] = useState<UndoState>(() => changes.getUndoState());
  useEffect(() => {
    return changes.onUndoStateChange(setState);
  }, [changes]);
  return state;
}

/**
 * Undo / redo buttons. When a step is not available the button stays focusable
 * (aria-disabled) and tapping it shows the reason as text, not only as a tooltip.
 */
export function UndoControls({ compact = false }: { compact?: boolean }) {
  const { changes } = useServices();
  const state = useUndoState();
  const [message, setMessage] = useState<string | null>(null);

  const run = async (direction: 'undo' | 'redo') => {
    const available = direction === 'undo' ? state.canUndo : state.canRedo;
    if (!available) {
      setMessage((direction === 'undo' ? state.undoDisabledReason : state.redoDisabledReason) ?? null);
      return;
    }
    const label = direction === 'undo' ? state.undoLabel : state.redoLabel;
    await (direction === 'undo' ? changes.undo() : changes.redo());
    setMessage(`${direction === 'undo' ? 'Deshecho' : 'Rehecho'}: ${label ?? 'último cambio'}`);
  };

  const size = compact ? 'px-3' : '';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className={size}
          aria-disabled={!state.canUndo}
          title={state.canUndo ? `Deshacer: ${state.undoLabel ?? ''}` : (state.undoDisabledReason ?? '')}
          onClick={() => void run('undo')}
        >
          Deshacer
        </Button>
        <Button
          variant="secondary"
          className={size}
          aria-disabled={!state.canRedo}
          title={state.canRedo ? `Rehacer: ${state.redoLabel ?? ''}` : (state.redoDisabledReason ?? '')}
          onClick={() => void run('redo')}
        >
          Rehacer
        </Button>
      </div>
      {message && (
        <p role="status" className="text-sm font-semibold" data-testid="undo-message">
          {message}
        </p>
      )}
    </div>
  );
}
