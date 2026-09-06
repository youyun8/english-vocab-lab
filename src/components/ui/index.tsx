import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/utils/cn';

/** Small, unopinionated primitives shared across features. */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-ink-900 text-white hover:bg-ink-800 disabled:bg-ink-300 disabled:text-ink-500',
  secondary:
    'bg-white text-ink-800 ring-1 ring-ink-300 hover:bg-ink-100 disabled:text-ink-400',
  ghost: 'text-ink-700 hover:bg-ink-100 disabled:text-ink-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'disabled:cursor-not-allowed',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}

export interface LinkButtonProps {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}

/**
 * A react-router `Link` that looks like a Button. Kept separate from `Button`
 * so navigation always renders a real anchor (right-click, middle-click and
 * screen readers all behave correctly).
 */
export function LinkButton({
  to,
  variant = 'secondary',
  size = 'md',
  className,
  children,
}: LinkButtonProps) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-ink-200 bg-white', className)}
      {...props}
    />
  );
}

export function SectionHeading({
  children,
  hint,
  id,
}: {
  children: ReactNode;
  hint?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 id={id} className="text-sm font-semibold tracking-wide text-ink-500 uppercase">
        {children}
      </h2>
      {hint ? <span className="text-xs text-ink-500">{hint}</span> : null}
    </div>
  );
}

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'muted';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  accent: 'bg-accent-50 text-accent-700 ring-accent-100',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-800 ring-amber-100',
  danger: 'bg-red-50 text-red-800 ring-red-100',
  muted: 'bg-transparent text-ink-500 ring-ink-200',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-ink-300 bg-white px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink-800">{title}</p>
      {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {children}
    </div>
  );
}

export function Spinner({ label = '載入中' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-500" role="status">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-ink-600"
      />
      <span>{label}</span>
    </div>
  );
}

/** A labelled numeric tile used across the dashboard and stats page. */
export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: BadgeTone;
}) {
  const accent =
    tone === 'accent'
      ? 'text-accent-700'
      : tone === 'success'
        ? 'text-emerald-700'
        : tone === 'danger'
          ? 'text-red-700'
          : tone === 'warning'
            ? 'text-amber-700'
            : 'text-ink-900';

  return (
    <Card className="px-4 py-3">
      <dt className="text-xs font-medium text-ink-500">{label}</dt>
      <dd className={cn('mt-1 text-2xl font-semibold tabular-nums', accent)}>{value}</dd>
      {hint ? <p className="mt-0.5 text-xs text-ink-400">{hint}</p> : null}
    </Card>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink-800">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-xs text-ink-500">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent-600' : 'bg-ink-300',
        )}
      >
        <span className="sr-only">{label}</span>
        <span
          aria-hidden="true"
          className={cn(
            // `left` must be explicit: without it the knob is placed at its
            // static position, which a button's centred text alignment puts in
            // the middle of the track - and the translate then pushes it clean
            // off the right edge.
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}
