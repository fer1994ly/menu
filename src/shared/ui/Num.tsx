import type { HTMLAttributes, ReactNode } from 'react';

/** Tabular number. `big` is for headline figures. */
export function Num({ children, big = false, className = '', ...props }: { children: ReactNode; big?: boolean } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`tabular inline-block ${big ? 'font-heading text-3xl font-bold' : ''} ${className}`} {...props}>
      {children}
    </span>
  );
}

export function Stat({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col" data-testid={testId}>
      <span className="text-sm font-semibold text-navy/70">{label}</span>
      <Num big>{children}</Num>
    </div>
  );
}
