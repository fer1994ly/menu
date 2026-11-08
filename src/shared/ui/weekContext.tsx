import { createContext, useContext } from 'react';

export interface WeekState {
  /** Week being looked at (delivery Sunday). */
  weekId: string;
  /** Week that is open for orders right now. */
  currentWeekId: string;
  /** Selectable weeks, newest first. */
  weeks: string[];
  setWeekId(weekId: string): void;
}

export const WeekContext = createContext<WeekState | null>(null);

export function useWeek(): WeekState {
  const value = useContext(WeekContext);
  if (!value) throw new Error('useWeek() must be used inside the week provider');
  return value;
}
