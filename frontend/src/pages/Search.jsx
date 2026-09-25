import { useSearchParams, useNavigate } from 'react-router-dom'
import { Search as SearchIcon, X, Loader2 } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

import { api } from '@/lib/api'
import { Spinner, EmptyState, Widget } from '@/components/ui'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuth } from '@/lib/auth'
import { searchProfileIndex } from '@/lib/profileSearchIndex'

export default function Search() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { isManager } = useAuth()
  // /admin/users needs manager-tier access on the backend (facility_manager
  // and up) -- technician is "staff" but not manager, and would still 403.
  const canSearchUsers = isManager()
  const query = searchParams.get('q') || ''
  const [debouncedQuery] = useDebounce(query, 300)
  const [results, setResults] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef(null)

  // Focus the input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const performSearch = async (q) => {
    if (!q?.trim()) {
      setResults({ issues: [], assets: [], lostFound: [], users: [] })
      return
    }

    setIsLoading(true)
    try {
      // /admin/users is staff-only -- calling it as a student/teacher isn't
      // just wasted work, it's a 403 on every keystroke, so it's left out
      // of the batch entirely rather than fired and swallowed.
      const [issues, assets, lostFound, users] = await Promise.allSettled([
        api.get('/issues', { params: { q, page_size: 10 } }),
        api.get('/campus/assets', { params: { q, page_size: 10 } }),
        api.get('/lost-found/items', { params: { q, page_size: 10, open_only: false } }),
        canSearchUsers
          ? api.get('/admin/users', { params: { q, page_size: 10 } })
          : Promise.resolve({ items: [] }),
      ])

      setResults({
        issues: issues.status === 'fulfilled' ? issues.value.items || [] : [],
        assets: assets.status === 'fulfilled' ? assets.value.items || [] : [],
        lostFound: lostFound.status === 'fulfilled' ? lostFound.value.items || [] : [],
        users: users.status === 'fulfilled' ? users.value.items || [] : [],
      })
    } catch (err) {
      console.error('Search failed:', err)
      setResults({ issues: [], assets: [], lostFound: [], users: [] })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    performSearch(debouncedQuery)
  }, [debouncedQuery])

  const clearSearch = () => {
    navigate('/search', { replace: true })
    inputRef.current?.focus()
  }

  // Settings/profile is a fixed client-side index (there's no separate
  // "settings record" API to query), so it's searched locally rather than
  // through performSearch's Promise.allSettled -- cheap enough to just
  // recompute on every render alongside the debounced query.
  const settingsMatches = searchProfileIndex(debouncedQuery)

  const totalResults = results
    ? results.issues.length + results.assets.length + results.lostFound.length
      + results.users.length + settingsMatches.length
    : 0

  return (
    <div className="min-h-screen bg-surface-base">
      {/* Search Header */}
      <header className="bg-surface border-b border-border-subtle sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 lg:px-margin">
          <div className="h-16 flex items-center gap-4">
            <button
              onClick={() => window.history.back()}
              className="btn-ghost h-9 w-9 p-0 rounded-lg"
              aria-label="Go back"
            >
              <X size={20} />
            </button>

            <div className="relative flex-1 max-w-3xl">
              <SearchIcon
                size={18} strokeWidth={2.25}
                className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
              />
              <input
                ref={inputRef}
                type="text"
                defaultValue={query}
                placeholder="Search issues, assets, lost & found, users, settings…"
                className="input pl-9 pr-10 h-10 text-base"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                    const params = new URLSearchParams()
                    params.set('q', e.currentTarget.value.trim())
                    navigate(`/search?${params.toString()}`, { replace: true })
                    inputRef.current?.blur()
                  }
                }}
              />
              {query && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-faint hover:text-ink rounded"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {isLoading && (
              <Loader2 size={20} className="animate-spin text-secondary" />
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 lg:px-margin py-6">
        {/* Search Query Display */}
        {query && (
          <div className="mb-6 flex items-center gap-3 text-body-md text-ink-muted">
            <SearchIcon size={16} className="text-secondary" />
            <span>Showing results for <strong className="text-ink">"{query}"</strong></span>
            {totalResults !== undefined && (
              <span className="pill bg-surface-sunken text-ink-muted">
                {totalResults} result{totalResults !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {!query && (
          <div className="text-center py-16">
            <SearchIcon size={48} className="mx-auto text-ink-faint mb-4" />
            <h1 className="text-headline-lg text-ink">Search Campus Netra</h1>
            <p className="text-body-md text-ink-muted mt-2 max-w-md mx-auto">
              Search across issues, assets, lost & found items, users, and settings. Start typing
              in the search bar above to find what you need.
            </p>
          </div>
        )}

        {query && isLoading && (
          <div className="grid lg:grid-cols-2 gap-5">
            {[1, 2, 3, 4].map((i) => (
              <Widget key={i} className="animate-pulse">
                <div className="h-4 bg-surface-sunken rounded w-3/4 mb-3" />
                <div className="h-4 bg-surface-sunken rounded w-1/2" />
                <div className="h-4 bg-surface-sunken rounded w-5/6" />
              </Widget>
            ))}
          </div>
        )}

        {query && !isLoading && results && (
          <div className="space-y-6">
            {results.issues.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-headline-sm text-ink flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-info-bg/20 grid place-items-center">
                      <SearchIcon size={14} className="text-info" />
                    </span>
                    Issues ({results.issues.length})
                  </h2>
                </div>
                <div className="space-y-2">
                  {results.issues.map((issue) => (
                    <a
                      key={issue.id}
                      href={`/issues/${issue.id}`}
                      className="block p-3 rounded-lg border border-border-subtle hover:bg-surface-sunken transition-colors"
                    >
                      <p className="text-body-md text-ink font-medium line-clamp-1">{issue.title}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-body-sm text-ink-muted">
                        <span className="pill bg-surface-sunken">{issue.category}</span>
                        <span className="pill bg-surface-sunken">{issue.priority}</span>
                        <span className="pill bg-surface-sunken">{issue.status}</span>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {results.assets.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-headline-sm text-ink flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-secondary-bg/20 grid place-items-center">
                      <SearchIcon size={14} className="text-secondary" />
                    </span>
                    Assets ({results.assets.length})
                  </h2>
                </div>
                <div className="space-y-2">
                  {results.assets.map((asset) => (
                    <a
                      key={asset.id}
                      href={`/assets/${asset.id}`}
                      className="block p-3 rounded-lg border border-border-subtle hover:bg-surface-sunken transition-colors"
                    >
                      <p className="text-body-md text-ink font-medium line-clamp-1">{asset.name}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-body-sm text-ink-muted">
                        <span className="pill bg-surface-sunken">{asset.category}</span>
                        <span className="pill bg-surface-sunken">{asset.status}</span>
                        {asset.room && <span className="pill bg-surface-sunken">{asset.room}</span>}
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {results.lostFound.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-headline-sm text-ink flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-warning-bg/20 grid place-items-center">
                      <SearchIcon size={14} className="text-warning" />
                    </span>
                    Lost & Found ({results.lostFound.length})
                  </h2>
                </div>
                <div className="space-y-2">
                  {results.lostFound.map((item) => (
                    <a
                      key={item.id}
                      href={`/lost-found/items/${item.id}`}
                      className="block p-3 rounded-lg border border-border-subtle hover:bg-surface-sunken transition-colors"
                    >
                      <p className="text-body-md text-ink font-medium line-clamp-1">{item.title}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-body-sm text-ink-muted">
                        <span className="pill bg-surface-sunken">{item.type}</span>
                        <span className="pill bg-surface-sunken">{item.status}</span>
                        {item.location && <span className="pill bg-surface-sunken">{item.location}</span>}
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {results.users.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-headline-sm text-ink flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-success-bg/20 grid place-items-center">
                      <SearchIcon size={14} className="text-success" />
                    </span>
                    Users ({results.users.length})
                  </h2>
                </div>
                <div className="space-y-2">
                  {results.users.map((user) => (
                    <a
                      key={user.id}
                      href={`/admin/users`}
                      className="block p-3 rounded-lg border border-border-subtle hover:bg-surface-sunken transition-colors"
                    >
                      <p className="text-body-md text-ink font-medium line-clamp-1">{user.full_name}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-body-sm text-ink-muted">
                        <span className="pill bg-surface-sunken">{user.email}</span>
                        <span className="pill bg-surface-sunken">{user.role}</span>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {settingsMatches.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-headline-sm text-ink flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-ai-bg/20 grid place-items-center">
                      <SearchIcon size={14} className="text-ink-muted" />
                    </span>
                    Settings ({settingsMatches.length})
                  </h2>
                </div>
                <div className="space-y-2">
                  {settingsMatches.map((m) => (
                    <a
                      key={m.route}
                      href={m.route}
                      className="block p-3 rounded-lg border border-border-subtle hover:bg-surface-sunken transition-colors"
                    >
                      <p className="text-body-md text-ink font-medium">{m.label}</p>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {totalResults === 0 && (
              <EmptyState
                icon={SearchIcon}
                title="No results found"
                description={`We couldn't find anything matching "${query}". Try a different search term.`}
              />
            )}
          </div>
        )}
      </main>
    </div>
  )
}