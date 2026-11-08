import type { ReactNode } from 'react';

const TONES = {
  neutral: 'bg-neutral text-navy',
  ok: 'bg-ok text-white',
  warning: 'bg-error text-white',
  accent: 'bg-accent text-navy',
} as const;

export function Badge({
  tone = 'neutral',
  children,
  ...props
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
  'data-testid'?: string;
}) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-sm font-semibold ${TONES[tone]}`} {...props}>
      {children}
    </span>
  );
}

/** Horizontal usage bar: `used` of `cap`; turns red when the cap is exceeded. */
export function UsageBar({ used, cap, label }: { used: number; cap: number; label: string }) {
  const ratio = cap > 0 ? used / cap : used > 0 ? 2 : 0;
  const over = used > cap;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={cap}
      aria-valuenow={used}
      className="h-3 w-full overflow-hidden rounded bg-neutral"
    >
      <div className={`h-full ${over ? 'bg-error' : 'bg-ok'}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-navy border-t-accent" />
      {label}
    </span>
  );
}
