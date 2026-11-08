import type { ReactNode } from 'react';

export function EmptyState({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="rounded border-2 border-dashed border-navy/40 p-6 text-center" data-testid="empty-state">
      <p className="font-heading text-lg font-bold">{message}</p>
      {children && <div className="mt-3 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
