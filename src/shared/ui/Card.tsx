import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  actions?: ReactNode;
}

export function Card({ title, actions, children, className = '', ...props }: CardProps) {
  return (
    <section className={`rounded border border-navy/20 bg-white p-4 ${className}`} {...props}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
