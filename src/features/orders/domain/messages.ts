import { formatWeekDate } from '@/shared/kernel/time';
import { ROUTE_DEFINITIONS, type RouteId } from '@/features/routes/domain/routes';

const sunday = (weekId: string): string => `domingo ${formatWeekDate(weekId)}`;

/** Spanish (voseo) texts shown when an order is moved. Each states exactly what happened. */
export const ORDER_MESSAGES = {
  /** `closeLabel` is `HH:MM`. */
  lateClose: (closeLabel: string, nextWeekId: string): string =>
    `El pedido entró después del cierre del sábado a las ${closeLabel}: pasa a la semana del ${sunday(nextWeekId)}.`,

  weekQuotaFull: (portions: number, freePortions: number, nextWeekId: string): string =>
    `Esta semana ${freePortions === 1 ? 'queda 1 porción' : `quedan ${freePortions} porciones`} y el pedido es de ${portions}: no se parte, pasa entero a la semana del ${sunday(nextWeekId)}.`,

  routeFallback: (route: RouteId): string =>
    `La ruta ${ROUTE_DEFINITIONS[route].label} está llena esta semana: el pedido pasa a la ruta abierta y no se cobra el cargo de ruta.`,

  routesFullNextWeek: (route: RouteId, nextWeekId: string): string =>
    route === 'open'
      ? `La ruta abierta está llena esta semana: el pedido pasa a la semana del ${sunday(nextWeekId)}.`
      : `La ruta ${ROUTE_DEFINITIONS[route].label} y la ruta abierta están llenas esta semana: el pedido pasa a la semana del ${sunday(nextWeekId)}.`,
} as const;

export function formatCloseTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
