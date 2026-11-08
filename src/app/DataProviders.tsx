import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DataVersionContext, ReloadContext, useLiveData } from '@/shared/ui/liveData';
import { WeekContext, type WeekState } from '@/shared/ui/weekContext';
import { nextWeekId, productionWeekId } from '@/shared/kernel/time';
import { useServices } from './AppServicesProvider';

/** Bumps the data version on every local change and on every message from other tabs. */
export function DataVersionProvider({ children }: { children: ReactNode }) {
  const services = useServices();
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const offChanges = services.changes.addChangeListener(reload);
    const offBus = services.bus.subscribe(reload);
    return () => {
      offChanges();
      offBus();
    };
  }, [services, reload]);

  return (
    <ReloadContext.Provider value={reload}>
      <DataVersionContext.Provider value={version}>{children}</DataVersionContext.Provider>
    </ReloadContext.Provider>
  );
}

/** Selected week (defaults to the week being produced) and the list of weeks to pick from. */
export function WeekProvider({ children }: { children: ReactNode }) {
  const services = useServices();
  const [selected, setSelected] = useState<string | null>(null);
  const { data } = useLiveData(async () => {
    const [menus, plans] = await Promise.all([services.repos.menus.list(), services.plans.listRecords()]);
    return { menuWeeks: menus.map((m) => m.weekId), planWeeks: plans.map((p) => p.weekId) };
  }, []);

  const value = useMemo<WeekState | null>(() => {
    if (!data) return null;
    const currentWeekId = productionWeekId(services.clock());
    const weeks = [...new Set([currentWeekId, nextWeekId(currentWeekId), ...data.menuWeeks, ...data.planWeeks])].sort().reverse();
    return { weekId: selected ?? currentWeekId, currentWeekId, weeks, setWeekId: setSelected };
  }, [data, selected, services]);

  if (!value) return <p className="p-4">Cargando semanas…</p>;
  return <WeekContext.Provider value={value}>{children}</WeekContext.Provider>;
}
