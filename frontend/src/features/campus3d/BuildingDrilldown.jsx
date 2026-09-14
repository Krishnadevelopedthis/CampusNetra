import { useState } from 'react'
import { ChevronRight, DoorOpen, Layers } from 'lucide-react'

import { Modal } from '@/components/ui'
import { ROOM_KIND_LABELS, TWIN_STATE } from '@/lib/format'

/**
 * Clicking a building on the map — 2D or 3D — used to jump straight to its
 * first floor in the Digital Twin, which skips past every other floor and
 * room a building actually has. This walks it as a building actually is
 * laid out: pick a floor, then pick a room on that floor, then land
 * somewhere that's actually about that room.
 *
 * Two chained modals rather than one long list, because a floor's room
 * count can be large enough that flattening "building × floor × room" into
 * one picker would defeat the point of narrowing down.
 */
export default function BuildingDrilldown({ building, onClose, onSelectRoom, canOpenRoom }) {
  const [floor, setFloor] = useState(null)

  if (!building) return null

  const floors = building.floors || []

  return (
    <>
      <Modal
        open={!floor} onClose={onClose}
        title={`${building.name} — choose a floor`}
      >
        {floors.length === 0 ? (
          <p className="text-body-md text-ink-faint text-center py-8">
            No floors have been added to this building yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {floors.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => setFloor(f)}
                  className="w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-lg border border-border-subtle hover:border-brand hover:bg-surface-sunken transition-colors text-left"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Layers size={16} className="text-ink-faint shrink-0" />
                    <span className="min-w-0">
                      <span className="text-body-md text-ink block truncate">{f.name}</span>
                      <span className="text-body-sm text-ink-faint">
                        {(f.rooms || []).length} room{(f.rooms || []).length === 1 ? '' : 's'}
                      </span>
                    </span>
                  </span>
                  <ChevronRight size={16} className="text-ink-faint shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={!!floor} onClose={() => setFloor(null)}
        title={floor ? `${floor.name} — choose a room` : ''}
      >
        {floor && (
          (floor.rooms || []).length === 0 ? (
            <p className="text-body-md text-ink-faint text-center py-8">
              No rooms have been added to this floor yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {floor.rooms.map((r) => {
                const label = TWIN_STATE[r.state]?.label || r.state
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => canOpenRoom && onSelectRoom(r, floor, building)}
                      disabled={!canOpenRoom}
                      className="w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-lg border border-border-subtle hover:border-brand hover:bg-surface-sunken transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-border-subtle disabled:hover:bg-transparent"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <DoorOpen size={16} className="text-ink-faint shrink-0" />
                        <span className="min-w-0">
                          <span className="text-body-md text-ink block truncate">{r.name}</span>
                          <span className="text-body-sm text-ink-faint">
                            {ROOM_KIND_LABELS[r.kind] || r.kind} · {r.asset_count ?? 0} asset
                            {(r.asset_count ?? 0) === 1 ? '' : 's'}
                            {r.open_issues > 0 && `, ${r.open_issues} open`}
                          </span>
                        </span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="w-2 h-2 rounded-full" style={{ background: r.colour }} />
                        {canOpenRoom
                          ? <ChevronRight size={16} className="text-ink-faint" />
                          : <span className="text-body-sm text-ink-faint">{label}</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )
        )}
        {floor && !canOpenRoom && (
          <p className="text-body-sm text-ink-faint mt-3 pt-3 border-t border-border-subtle">
            Asset-level detail is available to facility staff. This shows each
            room's current condition only.
          </p>
        )}
      </Modal>
    </>
  )
}
