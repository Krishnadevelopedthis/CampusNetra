import { lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight } from 'lucide-react'

import { ErrorState, Spinner, Widget } from '@/components/ui'
import { api } from '@/lib/api'
import { ROOM_KIND_LABELS, TWIN_STATE, dt, money } from '@/lib/format'

// Same reasoning as the campus-wide 3D view: three.js is heavy, so it only
// downloads for someone who actually opens a room's 3D view.
const RoomScene3D = lazy(() => import('@/features/campus3d/RoomScene3D'))

export default function RoomView3D() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  // Populated when arriving via the campus-map drilldown, so the breadcrumb
  // reads correctly without a second round trip just to name the building
  // and floor. A direct link (bookmark, refresh) won't have it — the page
  // still works, just without those two crumbs.
  const crumb = location.state || {}

  const room = useQuery({
    queryKey: ['room', roomId],
    queryFn: () => api.get(`/campus/rooms/${roomId}`),
  })
  const assets = useQuery({
    queryKey: ['room-assets', roomId],
    queryFn: () => api.get(`/campus/rooms/${roomId}/assets`),
    enabled: !!room.data,
  })
  const categories = useQuery({
    queryKey: ['asset-categories'],
    queryFn: () => api.get('/campus/asset-categories'),
  })

  if (room.isLoading) return <Spinner label="Loading room…" />
  if (room.error) return <ErrorState error={room.error} onRetry={room.refetch} />

  const categoryName = (id) => categories.data?.find((c) => c.id === id)?.name

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <nav className="flex items-center gap-1.5 text-body-sm text-ink-muted mb-2 flex-wrap">
          <Link to="/map" className="hover:text-ink flex items-center gap-1">
            <ArrowLeft size={14} /> Campus Map
          </Link>
          {crumb.buildingName && (
            <><ChevronRight size={12} /><span>{crumb.buildingName}</span></>
          )}
          {crumb.floorName && (
            <><ChevronRight size={12} /><span>{crumb.floorName}</span></>
          )}
        </nav>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-headline-lg text-ink">{room.data.name}</h1>
          <span className="pill bg-surface-sunken text-ink-muted">
            {ROOM_KIND_LABELS[room.data.kind] || room.data.kind}
          </span>
        </div>
        <p className="text-body-md text-ink-muted mt-1">
          {room.data.code}
          {room.data.capacity ? ` · Capacity ${room.data.capacity}` : ''}
          {room.data.area_sqft ? ` · ${room.data.area_sqft} sq ft` : ''}
        </p>
      </div>

      <Widget title="3D view" subtitle="Drag to orbit, scroll to zoom — click an asset to open it" bodyClass="p-0">
        <Suspense fallback={
          <div className="p-widget"><div className="skeleton w-full h-[420px] rounded-xl" /></div>
        }>
          <RoomScene3D
            room={room.data}
            assets={assets.data || []}
            onOpenAsset={(a) => navigate(`/assets/${a.id}`)}
          />
        </Suspense>
      </Widget>

      <Widget title="Assets in this room" bodyClass="p-0">
        {assets.isLoading ? (
          <div className="p-widget space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-4 rounded" />)}
          </div>
        ) : !assets.data?.length ? (
          <p className="text-body-md text-ink-faint text-center py-10">
            No assets recorded in this room yet.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Tag</th><th>Name</th><th>Category</th><th>Manufacturer / Model</th>
                  <th>Condition</th><th>Warranty</th><th className="text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {assets.data.map((a) => (
                  <tr key={a.id} className="cursor-pointer hover:bg-surface-sunken transition-colors"
                      onClick={() => navigate(`/assets/${a.id}`)}>
                    <td className="font-mono text-mono-data text-secondary">{a.tag}</td>
                    <td className="text-ink">{a.name}</td>
                    <td className="text-ink-muted">{categoryName(a.category_id) || '—'}</td>
                    <td className="text-ink-muted">
                      {[a.manufacturer, a.model].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td>
                      <span className="pill" style={{
                        background: `${TWIN_STATE[a.state]?.colour}1a`, color: TWIN_STATE[a.state]?.colour }}>
                        {TWIN_STATE[a.state]?.label || a.state}
                      </span>
                    </td>
                    <td className="text-ink-muted whitespace-nowrap">
                      {a.warranty_expiry ? dt(a.warranty_expiry, 'd MMM yyyy') : '—'}
                    </td>
                    <td className="text-right tabular">{a.cost ? money(a.cost) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Widget>
    </div>
  )
}
