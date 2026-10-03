import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { Download, QrCode, Search } from 'lucide-react'

import { Button, EmptyState, ErrorState, Field, Input, Select, SkeletonRows, Widget } from '@/components/ui'
import { api } from '@/lib/api'

// Scanning this deep link is the entire payload — encoding the asset's
// location directly in the QR image would go stale the moment the asset
// is moved to a different room, whereas /scan/asset/:id always resolves
// against the asset's *current* room/floor/building/campus at scan time.
function scanUrl(assetId) {
  return `${window.location.origin}/scan/asset/${assetId}`
}

function AssetSearchList({ q, where, onSelect, selectedId }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-asset-qr-search', q, where],
    queryFn: () => api.get('/campus/assets', {
      params: {
        q: q || undefined, page_size: 100, sort: 'tag',
        building_id: where.buildingId || undefined,
        floor_id: where.floorId || undefined,
        room_id: where.roomId || undefined,
      },
    }),
  })

  if (isLoading) return <SkeletonRows rows={6} />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  const items = data?.items || []
  if (!items.length) {
    return <EmptyState icon={QrCode} title="No assets found" description="Try a different search term." />
  }

  return (
    <div className="divide-y divide-border-subtle">
      {data.total > items.length && (
        <p className="px-3 py-2 text-body-xs text-ink-faint">
          Showing {items.length} of {data.total} — pick a building, floor or room, or search, to narrow it down.
        </p>
      )}
      {items.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onSelect(a)}
          className={
            'flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-hover ' +
            (selectedId === a.id ? 'bg-brand-bg/60' : '')
          }
        >
          <span className="min-w-0">
            <span className="block truncate text-body-sm font-medium text-ink">{a.name}</span>
            <span className="block truncate text-body-xs text-ink-faint">
              {a.tag} · {[a.building, a.floor, a.room].filter(Boolean).join(' / ') || 'Unplaced'}
            </span>
          </span>
          <span className="pill shrink-0" style={{ background: `${a.colour}1a`, color: a.colour }}>
            {a.state_label}
          </span>
        </button>
      ))}
    </div>
  )
}

function QRPanel({ asset }) {
  const canvasRef = useRef(null)
  const [dataUrl, setDataUrl] = useState('')

  useEffect(() => {
    if (!asset || !canvasRef.current) return
    const url = scanUrl(asset.id)
    QRCode.toCanvas(canvasRef.current, url, { width: 260, margin: 2 }, (err) => {
      if (err) return
      setDataUrl(canvasRef.current.toDataURL('image/png'))
    })
  }, [asset])

  if (!asset) {
    return (
      <EmptyState
        icon={QrCode}
        title="Select an asset"
        description="Pick an asset from the list to generate its QR code."
      />
    )
  }

  const download = () => {
    if (!dataUrl) return
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `${asset.tag}-qr.png`
    link.click()
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <div>
        <p className="text-body-sm font-medium text-ink">{asset.name}</p>
        <p className="text-body-xs text-ink-faint">{asset.tag}</p>
      </div>
      <div className="rounded-lg border border-border-subtle bg-white p-3">
        <canvas ref={canvasRef} />
      </div>
      <p className="max-w-xs text-body-xs text-ink-faint">
        Scanning this code opens a login-protected page that raises a complaint for
        this exact asset — its campus, building, floor and room fill in automatically.
      </p>
      <Button icon={Download} onClick={download} disabled={!dataUrl}>
        Download QR
      </Button>
    </div>
  )
}

/** Campus -> Building -> Floor -> Room, each list loaded from the one before. */
function LocationFilter({ where, setWhere }) {
  const campuses = useQuery({ queryKey: ['campuses'], queryFn: () => api.get('/campus/campuses') })
  const campusId = where.campusId || campuses.data?.[0]?.id || ''
  const buildings = useQuery({
    queryKey: ['buildings', campusId],
    queryFn: () => api.get(`/campus/campuses/${campusId}/buildings`),
    enabled: !!campusId,
  })
  const floors = useQuery({
    queryKey: ['floors', where.buildingId],
    queryFn: () => api.get(`/campus/buildings/${where.buildingId}/floors`),
    enabled: !!where.buildingId,
  })
  const rooms = useQuery({
    queryKey: ['plan-rooms', where.floorId],
    queryFn: () => api.get(`/campus/floors/${where.floorId}/plan`).then((d) => d.rooms),
    enabled: !!where.floorId,
  })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="Campus">
        <Select value={campusId} onChange={(e) => setWhere({ campusId: e.target.value })}>
          {(campuses.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Building">
        <Select value={where.buildingId || ''} disabled={!buildings.data?.length}
                onChange={(e) => setWhere((w) => ({ campusId: w.campusId, buildingId: e.target.value }))}>
          <option value="">All buildings</option>
          {(buildings.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </Field>
      <Field label="Floor">
        <Select value={where.floorId || ''} disabled={!where.buildingId}
                onChange={(e) => setWhere((w) => ({ ...w, floorId: e.target.value, roomId: '' }))}>
          <option value="">{where.buildingId ? 'All floors' : 'Pick a building first'}</option>
          {(floors.data || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
      </Field>
      <Field label="Room">
        <Select value={where.roomId || ''} disabled={!where.floorId}
                onChange={(e) => setWhere((w) => ({ ...w, roomId: e.target.value }))}>
          <option value="">{where.floorId ? 'All rooms' : 'Pick a floor first'}</option>
          {(rooms.data || []).map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}
        </Select>
      </Field>
    </div>
  )
}

export default function AdminAssetQR() {
  const [q, setQ] = useState('')
  const [where, setWhere] = useState({})
  const [selected, setSelected] = useState(null)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Widget title="Assets" subtitle="Choose the place, then pick or search an asset to generate its QR code">
        <LocationFilter where={where} setWhere={setWhere} />
        <Field label="Search" className="mt-3">
          <Input
            icon={Search}
            placeholder="Search by tag, name, model or serial…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </Field>
        <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-md border border-border-subtle">
          <AssetSearchList q={q} where={where} onSelect={setSelected} selectedId={selected?.id} />
        </div>
      </Widget>

      <Widget title="Asset QR" subtitle="Download and print for the physical asset">
        <QRPanel asset={selected} />
      </Widget>
    </div>
  )
}
