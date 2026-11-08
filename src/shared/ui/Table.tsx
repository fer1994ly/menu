import type { HTMLAttributes, TableHTMLAttributes } from 'react';

/** Wide tables scroll inside their own container, never the page. */
export function TableScroll({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`max-w-full overflow-x-auto rounded border border-navy/20 ${className}`} {...props} />;
}

export function Table({ className = '', ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={`w-full border-collapse text-left text-base tabular ${className}`} {...props} />;
}

export const TH = 'bg-navy px-3 py-2 text-sm font-semibold text-white whitespace-nowrap';
export const THN = `${TH} text-right`;
export const TD = 'border-t border-navy/10 px-3 py-2 whitespace-nowrap';
export const TDN = `${TD} text-right`;
