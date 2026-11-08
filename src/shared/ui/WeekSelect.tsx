import { Field, INPUT_CLASS } from './Field';
import { formatWeekLabel } from './format';
import { useWeek } from './weekContext';

/** Week picker: current week plus the history weeks. */
export function WeekSelect({ className = '' }: { className?: string }) {
  const { weekId, currentWeekId, weeks, setWeekId } = useWeek();
  return (
    <Field label="Semana" className={className}>
      {(control) => (
        <select {...control} className={INPUT_CLASS} value={weekId} onChange={(e) => setWeekId(e.target.value)}>
          {weeks.map((week) => (
            <option key={week} value={week}>
              {formatWeekLabel(week)}
              {week === currentWeekId ? ' (semana actual)' : ''}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
