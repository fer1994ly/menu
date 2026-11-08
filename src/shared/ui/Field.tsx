import { useId, type ReactNode } from 'react';

export interface FieldControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
}

export interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: string;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

export const INPUT_CLASS =
  'min-h-11 w-full rounded border-2 border-navy bg-white px-3 py-2 text-base tabular text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent aria-[invalid=true]:border-error';

/** Label + control + inline error («Valor fuera de rango»). The control comes from the render prop. */
export function Field({ label, error, hint, className = '', children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-msg`;
  const hasMessage = Boolean(error || hint);
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), ...(hasMessage ? { 'aria-describedby': messageId } : {}) })}
      {error ? (
        <p id={messageId} className="text-sm font-semibold text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-sm text-navy/70">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
