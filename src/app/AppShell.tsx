import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useServices } from './AppServicesProvider';
import { ToastRegion, SyncIndicator, useRemoteChanges } from './Toasts';
import { UndoControls } from './UndoControls';

export const MORE_PATHS = ['/mas', '/recetas', '/rutas', '/historial', '/ajustes', '/admin'];

const TABS = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/pedidos', label: 'Pedidos', end: false },
  { to: '/plan', label: 'Plan', end: false },
  { to: '/compras', label: 'Compras', end: false },
  { to: '/mas', label: 'Más', end: false },
] as const;

function Tabs({ variant, label }: { variant: 'top' | 'bottom'; label: string }) {
  const { pathname } = useLocation();
  const moreActive = MORE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const wrapper =
    variant === 'top'
      ? 'hidden gap-1 md:flex'
      : 'fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-2 border-accent bg-navy text-white md:hidden';
  return (
    <nav aria-label={label} className={wrapper}>
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => {
            const active = tab.to === '/mas' ? moreActive : isActive;
            const base =
              variant === 'top'
                ? 'rounded px-3 py-2 font-semibold hover:bg-white/10'
                : 'flex min-h-14 items-center justify-center px-1 text-sm font-semibold';
            return `${base} ${active ? 'bg-accent text-navy' : 'text-white'}`;
          }}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

function OperatorField() {
  const { session } = useServices();
  const [name, setName] = useState(() => session.get());
  const commit = () => {
    session.set(name);
    setName(session.get());
  };
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-semibold">Operador</span>
      <input
        className="min-h-9 w-32 rounded border-2 border-white/60 bg-white px-2 text-navy"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
    </label>
  );
}

export function AppShell() {
  const { toasts, dismiss, lastRemoteAt } = useRemoteChanges();
  return (
    <div className="min-h-screen bg-white">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <h1 className="text-xl font-bold">Privee Food</h1>
          <Tabs variant="top" label="Principal" />
          <SyncIndicator lastRemoteAt={lastRemoteAt} />
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-2 border-t border-white/20 px-4 py-2 text-navy">
          <div className="text-white">
            <OperatorField />
          </div>
          <UndoControls compact />
        </div>
      </header>
      <ToastRegion toasts={toasts} dismiss={dismiss} />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-4 md:pb-8">
        <Outlet />
      </main>
      <Tabs variant="bottom" label="Principal móvil" />
    </div>
  );
}
