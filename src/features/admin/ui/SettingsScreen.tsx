import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useServices } from '@/app/AppServicesProvider';
import type { SeedReport } from '@/features/seed/infrastructure/seedDatabase';
import { formatDecimal } from '@/shared/kernel/numberFormat';
import { Spinner } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Field, INPUT_CLASS } from '@/shared/ui/Field';
import { Notice } from '@/shared/ui/Notice';
import { formatWeekLabel } from '@/shared/ui/format';
import { useReload } from '@/shared/ui/liveData';

function OperatorCard() {
  const { session } = useServices();
  const [name, setName] = useState(() => session.get());
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <Card title="Operador">
      <p className="mb-3">Cada cambio queda registrado en el historial con este nombre. Es por pestaña.</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          session.set(name);
          setName(session.get());
          setSaved(session.get());
        }}
      >
        <Field label="Nombre del operador" className="min-w-48 flex-1">
          {(c) => <input {...c} className={INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary">
          Guardar nombre
        </Button>
      </form>
      {saved && (
        <Notice tone="ok" className="mt-3">
          Ahora los cambios quedan a nombre de {saved}.
        </Notice>
      )}
    </Card>
  );
}

type RestoreState = { step: 'idle' } | { step: 'confirm' } | { step: 'running' } | { step: 'done'; report: SeedReport } | { step: 'error'; message: string };

function RestoreCard() {
  const { restoreSampleData } = useServices();
  const reload = useReload();
  const [state, setState] = useState<RestoreState>({ step: 'idle' });

  const run = async () => {
    setState({ step: 'running' });
    try {
      const report = await restoreSampleData();
      setState({ step: 'done', report });
      reload();
    } catch (e) {
      setState({ step: 'error', message: e instanceof Error ? e.message : 'No se pudieron restaurar los datos' });
    }
  };

  return (
    <Card title="Datos de ejemplo">
      <p className="mb-3">Borra todo lo guardado (pedidos, recetas, historial) y vuelve a generar los 2.000 clientes, los 26.000 pedidos de 52 semanas y la semana actual.</p>
      {state.step === 'idle' && <Button onClick={() => setState({ step: 'confirm' })}>Restaurar datos de ejemplo</Button>}
      {state.step === 'confirm' && (
        <Notice tone="warning" title="¿Restaurar los datos de ejemplo?">
          <p>Esto borra todos los datos y el historial de este navegador. No se puede deshacer.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => void run()}>
              Sí, restaurar
            </Button>
            <Button onClick={() => setState({ step: 'idle' })}>No, volver</Button>
          </div>
        </Notice>
      )}
      {state.step === 'running' && (
        <p>
          <Spinner label="Restaurando… puede tardar unos segundos." />
        </p>
      )}
      {state.step === 'done' && (
        <Notice tone="ok" title="Datos restaurados" data-testid="restore-report">
          <p>
            Listo en {formatDecimal(state.report.elapsedMs, 0)} ms.
            {state.report.currentWeekId ? ` Semana actual: ${formatWeekLabel(state.report.currentWeekId)}.` : ''}
          </p>
          <Button className="mt-2" onClick={() => setState({ step: 'idle' })}>
            Entendido
          </Button>
        </Notice>
      )}
      {state.step === 'error' && <Notice tone="error">{state.message}</Notice>}
    </Card>
  );
}

export function SettingsScreen() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Ajustes</h2>
      <OperatorCard />
      <RestoreCard />
      <Card title="Administración">
        <p className="mb-3">Topes de pollo y res, banda de kcal, proteína mínima, paquetes, cierre, cupos y rutas.</p>
        <Link className="inline-flex min-h-11 items-center rounded border-2 border-navy px-4 font-semibold hover:bg-neutral" to="/admin">
          Ir al panel de administración
        </Link>
      </Card>
      <Notice>
        Los valores nutricionales y las metas (kcal, proteína) son datos de ejemplo configurables. Tienen que ser validados por un profesional de la nutrición antes de usarse con
        clientes.
      </Notice>
    </div>
  );
}
