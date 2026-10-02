import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'

/**
 * Filter state for a list of assets: one chip per category actually present
 * (with counts, biggest first) plus free-text search. Shared by the room panel
 * and the Report Issue asset picker so both filter the same way.
 */
export function useAssetFilter(assets) {
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const counts = new Map()
    for (const a of assets) {
      const c = a.category || 'Other'
      counts.set(c, (counts.get(c) || 0) + 1)
    }
    return [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
  }, [assets])

  const q = query.trim().toLowerCase()
  const shown = assets.filter((a) =>
    (category === 'all' || (a.category || 'Other') === category)
    && (!q || a.name.toLowerCase().includes(q) || a.tag.toLowerCase().includes(q)))

  return { category, setCategory, query, setQuery, groups, shown, total: assets.length }
}

export function AssetFilterBar({ filter }) {
  const { category, setCategory, query, setQuery, groups, total } = filter
  const chip = (active) =>
    `shrink-0 whitespace-nowrap px-2.5 h-8 rounded-full border text-body-sm transition-colors ${
      active
        ? 'border-secondary text-secondary bg-surface-sunken font-medium'
        : 'border-border-subtle text-ink-muted bg-surface hover:text-ink'
    }`

  return (
    <>
      {groups.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 max-w-full min-w-0" role="tablist" aria-label="Filter assets by category">
          <button type="button" className={chip(category === 'all')} onClick={() => setCategory('all')}>
            All ({total})
          </button>
          {groups.map(([name, n]) => (
            <button key={name} type="button" className={chip(category === name)}
                    onClick={() => setCategory(name)}>
              {name} ({n})
            </button>
          ))}
        </div>
      )}

      {total > 8 && (
        <div className="relative mb-3 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assets"
            className="input pl-9 h-9 w-full"
            aria-label="Search assets"
          />
        </div>
      )}
    </>
  )
}

/**
 * Every asset in the open room, filtered. Tapping an asset hands it to
 * `onSelect`; the page then shows its details with a "Report a complaint"
 * button that already knows the building, floor and room.
 */
export default function RoomAssetList({ assets, selectedId, onSelect }) {
  const filter = useAssetFilter(assets)
  const { shown, total } = filter

  return (
    <div className="mt-5">
      <p className="text-label-caps uppercase text-ink-muted mb-2">
        Assets in this room — tap one for details or to report a problem
      </p>

      <AssetFilterBar filter={filter} />

      {shown.length === 0 ? (
        <p className="text-body-sm text-ink-faint py-2">No assets match.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {shown.map((a) => (
              <button
                key={a.id} type="button" onClick={() => onSelect?.(a)}
                className={`pill border bg-surface hover:bg-surface-sunken transition-colors text-left max-w-full ${
                  selectedId === a.id ? 'border-secondary' : 'border-border-subtle'
                }`}
                title={`${a.name} - ${a.label || ''}`.trim()}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: a.colour }} />
                <span className="text-body-sm truncate">{a.name}</span>
              </button>
            ))}
          </div>
          {shown.length !== total && (
            <p className="text-body-xs text-ink-faint mt-2">Showing {shown.length} of {total}</p>
          )}
        </>
      )}
    </div>
  )
}
