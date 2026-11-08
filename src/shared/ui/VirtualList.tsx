import { useVirtualizer, type Rect } from '@tanstack/react-virtual';
import { useRef, type ReactNode } from 'react';

export interface VirtualListProps {
  count: number;
  rowHeight: number;
  /** Height of the scroll area in px (also used where layout is not computed, e.g. jsdom). */
  height?: number;
  label: string;
  testId?: string;
  renderRow(index: number): ReactNode;
}

/**
 * Windowed list: only the visible rows exist in the DOM, so tens of thousands of
 * rows stay fast. Scrolls inside its own container, never the page.
 */
export function VirtualList({ count, rowHeight, height = 560, label, testId, renderRow }: VirtualListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- the virtualizer is only used inside this component
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 6,
    initialRect: { width: 320, height },
    observeElementRect: (instance, cb) => {
      const element = instance.scrollElement;
      if (!element) return undefined;
      const report = () => {
        const rect = element.getBoundingClientRect();
        const size: Rect = { width: rect.width || 320, height: rect.height || height };
        cb(size);
      };
      report();
      if (typeof ResizeObserver === 'undefined') return undefined;
      const observer = new ResizeObserver(report);
      observer.observe(element);
      return () => observer.disconnect();
    },
  });

  return (
    <div
      ref={parentRef}
      role="list"
      aria-label={label}
      data-testid={testId}
      className="overflow-y-auto rounded border border-navy/20"
      style={{ height: Math.min(height, count * rowHeight + 2) }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            role="listitem"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: rowHeight, transform: `translateY(${item.start}px)` }}
          >
            {renderRow(item.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
