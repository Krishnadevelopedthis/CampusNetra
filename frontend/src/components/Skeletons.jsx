import clsx from 'clsx'

/**
 * Loading placeholders shaped like the content they stand in for.
 *
 * A centred spinner tells you the page is busy; it does not tell you what is
 * arriving, and it throws away the layout so everything jumps into place at
 * the end. These keep the page's shape, so a refresh reads as the same page
 * reloading rather than a different screen.
 */

export function SkeletonLine({ w = 'full', h = 'h-4', className }) {
  const widths = {
    full: 'w-full', '3/4': 'w-3/4', '1/2': 'w-1/2', '1/3': 'w-1/3', '1/4': 'w-1/4',
  }
  return <div className={clsx('skeleton', h, widths[w] || w, className)} />
}

export function SkeletonMetrics({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="widget p-widget space-y-3">
          <SkeletonLine w="1/2" h="h-3" />
          <SkeletonLine w="3/4" h="h-8" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonWidget({ lines = 4, className, title = true }) {
  return (
    <div className={clsx('widget', className)}>
      {title && (
        <div className="widget-header">
          <SkeletonLine w="1/3" h="h-5" />
        </div>
      )}
      <div className="widget-body space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonLine key={i} w={i === lines - 1 ? '1/2' : 'full'} />
        ))}
      </div>
    </div>
  )
}

export function SkeletonChart({ height = 260, className }) {
  // Bars of varied height, so it reads as a chart rather than a grey slab.
  const bars = [55, 80, 40, 95, 65, 75, 50]
  return (
    <div className={clsx('widget', className)}>
      <div className="widget-header"><SkeletonLine w="1/3" h="h-5" /></div>
      <div className="widget-body">
        <div className="flex items-end gap-3" style={{ height }}>
          {bars.map((pct, i) => (
            <div key={i} className="skeleton flex-1 rounded-t" style={{ height: `${pct}%` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 8, cols = 5, className }) {
  return (
    <div className={clsx('widget overflow-hidden', className)}>
      <div className="widget-header"><SkeletonLine w="1/4" h="h-5" /></div>
      <div className="px-3 py-2.5 bg-surface-sunken border-b border-border-subtle flex gap-3">
        {Array.from({ length: cols }).map((_, c) => (
          <SkeletonLine key={c} h="h-3" w="full" />
        ))}
      </div>
      <div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-3 px-3 py-3.5 border-b border-border-subtle last:border-0">
            {Array.from({ length: cols }).map((_, c) => (
              <SkeletonLine key={c} w="full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonCards({ count = 6, className }) {
  return (
    <div className={clsx('grid sm:grid-cols-2 lg:grid-cols-3 gap-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="widget p-widget space-y-3">
          <div className="skeleton h-32 rounded-lg" />
          <SkeletonLine w="3/4" h="h-5" />
          <SkeletonLine w="1/2" h="h-3" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonList({ rows = 6, className }) {
  return (
    <div className={clsx('widget divide-y divide-border-subtle', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-widget">
          <div className="skeleton w-10 h-10 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonLine w="1/2" />
            <SkeletonLine w="1/3" h="h-3" />
          </div>
          <div className="skeleton h-6 w-20 rounded-xl shrink-0" />
        </div>
      ))}
    </div>
  )
}

/** Digital twin / map pages: a large canvas with a side rail. */
export function SkeletonPlan({ className }) {
  return (
    <div className={clsx('grid lg:grid-cols-[1fr_320px] gap-4', className)}>
      <div className="widget p-widget">
        <div className="skeleton w-full rounded-lg" style={{ aspectRatio: '16 / 10' }} />
      </div>
      <SkeletonWidget lines={6} />
    </div>
  )
}
