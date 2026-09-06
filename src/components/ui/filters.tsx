import { useId, useState, type ReactNode } from 'react';

import { Button } from './index';
import { cn } from '@/utils/cn';

/**
 * Filter primitives shared by the word bank and the question bank.
 *
 * Both pages filter large collections, so both need the same three things: a
 * chip that toggles one value and can carry a result count, a section that
 * collapses when the reader is done with it, and a rail that keeps the whole
 * set reachable — including the count of what is currently applied, so a
 * surprising result never has an invisible cause.
 */

export function ToggleChip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  /** Matches this option would leave, shown beside the label when known. */
  count?: number;
  children: ReactNode;
}) {
  const empty = count === 0 && !active;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-ink-900 bg-ink-900 text-white'
          : empty
            ? 'border-ink-200 bg-surface text-ink-400'
            : 'border-ink-300 bg-surface text-ink-600 hover:border-ink-400 hover:text-ink-900',
      )}
    >
      <span>{children}</span>
      {count == null ? null : (
        <>
          <span
            aria-hidden="true"
            className={cn('tabular-nums', active ? 'text-white/70' : 'text-ink-400')}
          >
            {count}
          </span>
          {/* Read as "C2, 784 words" rather than running into the label. */}
          <span className="sr-only">，{count} 個</span>
        </>
      )}
    </button>
  );
}

/** A collapsible block of filters. Open by default: hidden filters get missed. */
export function FilterGroup({
  label,
  hint,
  defaultOpen = true,
  children,
}: {
  label: string;
  /** Short summary shown in the header, e.g. how many values are selected. */
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className="border-t border-ink-200 pt-3 first:border-t-0 first:pt-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 text-xs font-semibold tracking-wide text-ink-500 uppercase transition-colors hover:text-ink-900"
      >
        <span>{label}</span>
        <span className="flex items-center gap-1.5 normal-case">
          {hint ? (
            <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-600">
              {hint}
            </span>
          ) : null}
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className={cn('h-3 w-3 text-ink-400 transition-transform', open ? '' : '-rotate-90')}
          >
            <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </span>
      </button>
      <div id={id} hidden={!open} className="mt-2.5">
        {children}
      </div>
    </div>
  );
}

/** Chips for the filters currently applied; clicking one removes it. */
export function ActiveFilters({
  items,
}: {
  items: { key: string; label: string; onRemove: () => void }[];
}) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="已套用的篩選">
      {items.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            onClick={item.onRemove}
            className="inline-flex items-center gap-1 rounded-full bg-ink-900 px-2 py-0.5 text-xs font-medium text-white transition-colors hover:bg-ink-700"
          >
            {item.label}
            <span aria-hidden="true" className="text-white/70">
              ×
            </span>
            <span className="sr-only">（移除此條件）</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The rail itself: a sticky, independently scrolling column on wide screens so
 * a long filter list never pushes the results out of reach.
 */
export function FilterRail({
  title = '篩選',
  activeCount,
  resultLabel,
  onClear,
  children,
}: {
  title?: string;
  activeCount: number;
  /** Result summary shown at the foot of the rail, e.g. "128 個結果". */
  resultLabel: string;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex max-h-[calc(100vh-6rem)] flex-col rounded-lg border border-ink-200 bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-ink-200 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          {title}
          {activeCount > 0 ? (
            <span className="rounded-full bg-ink-900 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
              {activeCount}
            </span>
          ) : null}
        </p>
        <Button size="sm" variant="ghost" disabled={activeCount === 0} onClick={onClear}>
          清除篩選
        </Button>
      </div>

      <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-3.5">{children}</div>

      <p className="border-t border-ink-200 px-4 py-2.5 text-xs text-ink-500" aria-live="polite">
        {resultLabel}
      </p>
    </div>
  );
}
