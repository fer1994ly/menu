import type { HTMLAttributes, ReactNode } from 'react';

export type NoticeTone = 'info' | 'ok' | 'warning' | 'error';

const TONES: Record<NoticeTone, string> = {
  info: 'border-navy bg-neutral text-navy',
  ok: 'border-ok bg-ok/10 text-navy',
  warning: 'border-error bg-white text-error',
  error: 'border-error bg-error text-white',
};

export interface NoticeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: NoticeTone;
  title?: ReactNode;
}

/** Inline message. Warnings and errors use role="alert"; they are never tooltips. */
export function Notice({ tone = 'info', title, children, className = '', ...props }: NoticeProps) {
  const role = tone === 'warning' || tone === 'error' ? 'alert' : 'status';
  return (
    <div role={role} className={`rounded border-l-8 px-4 py-3 text-base ${TONES[tone]} ${className}`} {...props}>
      {title && <p className="font-heading font-bold">{title}</p>}
      {children}
    </div>
  );
}
