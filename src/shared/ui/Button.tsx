import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-navy border-accent hover:brightness-95 font-semibold',
  secondary: 'bg-white text-navy border-navy hover:bg-neutral',
  danger: 'bg-white text-error border-error hover:bg-neutral',
  ghost: 'bg-transparent text-inherit border-transparent hover:bg-white/10',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** Touch friendly button (44 px minimum). Accent colour is reserved for the primary action. */
export function Button({ variant = 'secondary', className = '', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded border-2 px-4 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
