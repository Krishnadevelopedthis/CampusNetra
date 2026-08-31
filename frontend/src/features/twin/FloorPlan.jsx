import clsx from 'clsx'
import { useMemo, useRef, useState } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'

import { mediaUrl } from '@/lib/api'
import { TWIN_STATE } from '@/lib/format'

/**
 * SVG floor plan.
 *
 * Geometry is normalised 0..1 in the database, so the plan scales to any
 * viewport without re-fetching. Rooms are polygons; assets are 24px nodes with
 * a 2px white ring, per the design spec.
 */
const VB = 1000 // internal viewBox width; the height follows the plan's shape

export function FloorPlan({
  rooms = [],
  planImage,
  planWidth,
  planHeight,
  selectedRoomId,
  selectedAssetId,
  recentlyChanged = new Set(),
  onSelectRoom,
  onSelectAsset,
  className,
}) {
  // The canvas takes the plan's proportions so the drawing fills it exactly.
  // A fixed square viewBox letterboxed a wide plan inside itself while the room
  // outlines were still drawn across the full square, so on a 1600x1000 plan
  // every room sat about a fifth of the canvas above the walls it belonged to.
  const vbH = planWidth && planHeight ? Math.round((VB * planHeight) / planWidth) : VB

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [hover, setHover] = useState(null)
  const drag = useRef(null)
  const svgRef = useRef(null)

  const startPan = (e) => {
    // Panning only from empty canvas, so it never fights element selection.
    if (e.target !== svgRef.current) return
    drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }
  const movePan = (e) => {
    if (!drag.current) return
    setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })
  }
  const endPan = () => { drag.current = null }

  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  const polygons = useMemo(
    () =>
      rooms.map((room) => ({
        room,
        points: (room.boundary || [])
          .map(([x, y]) => `${x * VB},${y * vbH}`)
          .join(' '),
        // Label sits at the polygon's top-left corner, inset slightly.
        anchor: (room.boundary || []).length
          ? {
              x: Math.min(...room.boundary.map((p) => p[0])) * VB + 14,
              y: Math.min(...room.boundary.map((p) => p[1])) * vbH + 26,
            }
          : null,
        centre: (room.boundary || []).length
          ? {
              x: (room.boundary.reduce((s, p) => s + p[0], 0) / room.boundary.length) * VB,
              y: (room.boundary.reduce((s, p) => s + p[1], 0) / room.boundary.length) * vbH,
            }
          : null,
      })),
    [rooms, vbH],
  )

  return (
    <div className={clsx('relative bg-surface-sunken overflow-hidden select-none', className)}>
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-20 flex flex-col bg-surface rounded border border-border-subtle shadow-level2 no-print">
        <button onClick={() => setZoom((z) => Math.min(z * 1.25, 4))}
                className="h-9 w-9 grid place-items-center hover:bg-surface-sunken" aria-label="Zoom in">
          <Plus size={16} />
        </button>
        <button onClick={() => setZoom((z) => Math.max(z / 1.25, 0.5))}
                className="h-9 w-9 grid place-items-center hover:bg-surface-sunken border-y border-border-subtle" aria-label="Zoom out">
          <Minus size={16} />
        </button>
        <button onClick={reset} className="h-9 w-9 grid place-items-center hover:bg-surface-sunken" aria-label="Reset view">
          <Maximize2 size={15} />
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB} ${vbH}`}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={startPan} onMouseMove={movePan}
        onMouseUp={endPan} onMouseLeave={endPan}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center' }}
        role="img" aria-label="Floor plan"
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" className="stroke-border-subtle" strokeWidth="1" />
          </pattern>
        </defs>

        {/* Level 0 — the physical base of the UI. */}
        <rect width={VB} height={vbH} fill="url(#grid)" />

        {/* The architectural drawing the rooms were traced from. Without it the
            twin is coloured polygons floating on a grid; with it, the state
            sits on the plan people already recognise. Dimmed so the asset
            markers stay the thing you read first. */}
        {planImage && (
          <image
            href={mediaUrl(planImage)} x="0" y="0" width={VB} height={vbH}
            preserveAspectRatio="none" opacity="0.35"
            className="pointer-events-none"
          />
        )}

        {polygons.map(({ room, points, anchor, centre }) => {
          if (!points) return null
          const selected = room.id === selectedRoomId
          const colour = room.aggregate_colour || '#10b981'
          return (
            <g key={room.id}
               onClick={() => onSelectRoom?.(room)}
               className="cursor-pointer"
               onMouseEnter={() => setHover({ kind: 'room', room })}
               onMouseLeave={() => setHover(null)}>
              <polygon
                points={points}
                /* 40% fill keeps the base map visible through the data layer. */
                fill={colour} fillOpacity={selected ? 0.28 : 0.14}
                stroke={selected ? '#3b82f6' : colour}
                strokeWidth={selected ? 3 : 1.5}
                strokeDasharray={room.open_issue_count > 0 ? '0' : '0'}
                className="transition-all duration-200"
              />
              {anchor && (
                <>
                  <text x={anchor.x} y={anchor.y}
                        fontSize="19" className="font-mono pointer-events-none fill-ink" fillOpacity="0.75">
                    {room.code}
                  </text>
                  <text x={anchor.x} y={anchor.y + 20}
                        fontSize="15" className="pointer-events-none fill-ink-faint">
                    {room.name}
                  </text>
                </>
              )}
              {room.open_issue_count > 0 && centre && (
                <g className="pointer-events-none">
                  <circle cx={centre.x} cy={centre.y - 40} r="15" fill="#ef4444" />
                  <text x={centre.x} y={centre.y - 34} textAnchor="middle"
                        fontSize="16" fill="white" fontWeight="700">
                    {room.open_issue_count}
                  </text>
                </g>
              )}
            </g>
          )
        })}

        {/* Asset markers: 24px nodes with a 2px white border. */}
        {rooms.flatMap((room) =>
          (room.assets || []).map((asset) => {
            if (asset.pos_x == null || asset.pos_y == null || !room.boundary?.length) return null
            const xs = room.boundary.map((p) => p[0])
            const ys = room.boundary.map((p) => p[1])
            const x = (Math.min(...xs) + asset.pos_x * (Math.max(...xs) - Math.min(...xs))) * VB
            const y = (Math.min(...ys) + asset.pos_y * (Math.max(...ys) - Math.min(...ys))) * vbH
            const selected = asset.id === selectedAssetId
            const pulsing = recentlyChanged.has(asset.id)

            return (
              <g key={asset.id} transform={`translate(${x},${y})`}
                 onClick={(e) => { e.stopPropagation(); onSelectAsset?.(asset, room) }}
                 onMouseEnter={() => setHover({ kind: 'asset', asset, room })}
                 onMouseLeave={() => setHover(null)}
                 className="cursor-pointer">
                {pulsing && (
                  <circle r="14" fill={asset.colour} className="animate-pulse-ring" />
                )}
                {selected && <circle r="20" fill="none" stroke="#3b82f6" strokeWidth="2.5" />}
                <circle r="12" fill={asset.colour} className="stroke-surface" strokeWidth="2" />
                {asset.open_issue_count > 0 && (
                  <circle r="4" cx="10" cy="-10" fill="#ef4444" className="stroke-surface" strokeWidth="1.5" />
                )}
              </g>
            )
          }),
        )}
      </svg>

      {/* Level 3 spatial tooltip */}
      {hover && (
        <div className="absolute bottom-3 left-3 z-20 bg-surface/95 backdrop-blur border border-border-subtle rounded-lg shadow-level3 p-3 max-w-xs pointer-events-none animate-fade-in">
          {hover.kind === 'asset' ? (
            <>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: hover.asset.colour }} />
                <p className="text-body-md font-medium truncate">{hover.asset.name}</p>
              </div>
              <p className="font-mono text-mono-data text-ink-faint mt-1">{hover.asset.tag}</p>
              <p className="text-body-sm text-ink-muted mt-1">
                {hover.asset.label} · {hover.room.code}
              </p>
              {hover.asset.active_issue_reference && (
                <p className="text-body-sm text-danger-text mt-1 font-mono">
                  {hover.asset.active_issue_reference}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-body-md font-medium">{hover.room.name}</p>
              <p className="font-mono text-mono-data text-ink-faint mt-0.5">
                {hover.room.zone_id || hover.room.code}
              </p>
              <p className="text-body-sm text-ink-muted mt-1">
                {hover.room.assets?.length || 0} assets · {hover.room.open_issue_count} open issues
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function TwinLegend({ breakdown, className }) {
  return (
    <div className={clsx('flex flex-wrap gap-x-4 gap-y-2', className)}>
      {Object.entries(TWIN_STATE)
        .filter(([k]) => k !== 'decommissioned' || breakdown?.[k])
        .map(([key, { colour, label }]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full ring-2 ring-white shrink-0" style={{ background: colour }} />
            <span className="text-body-sm text-ink-muted">{label}</span>
            {breakdown?.[key] != null && (
              <span className="text-body-sm font-medium text-ink tabular">{breakdown[key]}</span>
            )}
          </div>
        ))}
    </div>
  )
}
