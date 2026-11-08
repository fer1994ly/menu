import { Link } from 'react-router-dom';
import { Card } from '@/shared/ui/Card';

/** Shown while IndexedDB is opened and, the very first time, the sample data is generated. */
export function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-navy p-6 text-center text-white">
      <h1 className="text-3xl font-bold">Privee Food</h1>
      <p role="status" className="max-w-sm text-lg">
        Preparando los datos… la primera vez generamos los clientes, recetas y pedidos de ejemplo y puede tardar unos segundos.
      </p>
      <span aria-hidden className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-accent" />
    </div>
  );
}

/** Blocking full-screen notice: the app cannot work without IndexedDB. */
export function BlockingNotice({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy p-6">
      <div role="alert" className="max-w-md rounded border-l-8 border-error bg-white p-6 text-navy">
        <h1 className="mb-2 text-2xl font-bold">No se puede abrir la app</h1>
        <p className="text-lg">{message}</p>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <Card>
      <h2 className="mb-2 text-2xl font-bold">Esta página no existe</h2>
      <p className="mb-4">Revisá la dirección o volvé al inicio.</p>
      <Link className="inline-flex min-h-11 items-center rounded border-2 border-accent bg-accent px-4 font-semibold" to="/">
        Volver al inicio
      </Link>
    </Card>
  );
}

const MORE_LINKS = [
  { to: '/recetas', title: 'Recetas', text: 'Fichas, validaciones y menú semanal' },
  { to: '/rutas', title: 'Rutas', text: 'Rutas del domingo, cupos y ocupación' },
  { to: '/historial', title: 'Historial', text: 'Cambios, deshacer y estado al…' },
  { to: '/ajustes', title: 'Ajustes', text: 'Operador y datos de ejemplo' },
  { to: '/admin', title: 'Admin', text: 'Topes, kcal, proteína, paquetes y cupos' },
] as const;

export function MoreScreen() {
  return (
    <div>
      <h2 className="mb-3 text-2xl font-bold">Más</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {MORE_LINKS.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className="block rounded border-2 border-navy p-4 hover:bg-neutral">
              <span className="block font-heading text-lg font-bold">{link.title}</span>
              <span className="text-navy/80">{link.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
