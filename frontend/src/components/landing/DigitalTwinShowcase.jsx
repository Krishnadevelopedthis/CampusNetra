import { useState } from 'react'
import { accent } from '@/lib/accentColors'
import {
  Layers,
  AlertTriangle,
  Activity,
  Eye,
  Users,
  Zap,
  CheckCircle,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Radio,
  Sliders,
} from 'lucide-react'
import clsx from 'clsx'
import { motion } from 'framer-motion'

const FLOORS = [
  { id: 'gf', label: 'Ground Floor — Common & Public' },
  { id: 'f1', label: 'Floor 1 — Labs & Classrooms' },
  { id: 'f2', label: 'Floor 2 — IT & High Density' },
]

const INITIAL_ROOMS = {
  gf: [
    {
      id: 'r1',
      label: 'Main Atrium',
      x: 4,
      y: 4,
      w: 38,
      h: 24,
      status: 'healthy',
      power: '4.2 kW',
      occupants: 34,
      system: 'Central Chilled Beam A',
    },
    {
      id: 'r2',
      label: 'Dining Commons',
      x: 46,
      y: 4,
      w: 48,
      h: 28,
      status: 'warning',
      power: '12.8 kW',
      occupants: 120,
      system: 'Exhaust Fan Unit 2 (High load)',
    },
    {
      id: 'r3',
      label: 'Admin Bureau',
      x: 4,
      y: 32,
      w: 38,
      h: 24,
      status: 'healthy',
      power: '2.1 kW',
      occupants: 14,
      system: 'VAV Box 102',
    },
    {
      id: 'r4',
      label: 'Storage Annex',
      x: 46,
      y: 36,
      w: 22,
      h: 20,
      status: 'fault',
      power: '0.4 kW',
      occupants: 0,
      system: 'Leak Sensor Alarm Active',
    },
    {
      id: 'r5',
      label: 'Substation Infeed',
      x: 72,
      y: 36,
      w: 22,
      h: 20,
      status: 'maintenance',
      power: '45.0 kW',
      occupants: 2,
      system: 'Transformer Diagnostic Mode',
    },
    {
      id: 'r6',
      label: 'Auditorium North',
      x: 4,
      y: 60,
      w: 90,
      h: 34,
      status: 'healthy',
      power: '8.4 kW',
      occupants: 0,
      system: 'Air Handling Unit 1 (Standby)',
    },
  ],
  f1: [
    {
      id: 'r7',
      label: 'Biochem Lab 101',
      x: 4,
      y: 4,
      w: 42,
      h: 28,
      status: 'healthy',
      power: '6.5 kW',
      occupants: 18,
      system: 'Precision Fume Hood Scrubber',
    },
    {
      id: 'r8',
      label: 'Physics Lab 102',
      x: 50,
      y: 4,
      w: 44,
      h: 28,
      status: 'healthy',
      power: '5.2 kW',
      occupants: 22,
      system: 'Optics HVAC Zone 4',
    },
    {
      id: 'r9',
      label: 'Lecture Hall 103',
      x: 4,
      y: 36,
      w: 52,
      h: 30,
      status: 'warning',
      power: '7.8 kW',
      occupants: 85,
      system: 'CO2 Threshold Advisory',
    },
    {
      id: 'r10',
      label: 'Faculty Office',
      x: 60,
      y: 36,
      w: 34,
      h: 30,
      status: 'healthy',
      power: '2.0 kW',
      occupants: 11,
      system: 'VAV Box 204',
    },
    {
      id: 'r11',
      label: 'Sanitary Wing',
      x: 4,
      y: 70,
      w: 26,
      h: 24,
      status: 'fault',
      power: '1.1 kW',
      occupants: 3,
      system: 'Water Pressure Sensor Tripped',
    },
    {
      id: 'r12',
      label: 'Study Lounge',
      x: 34,
      y: 70,
      w: 60,
      h: 24,
      status: 'healthy',
      power: '3.4 kW',
      occupants: 29,
      system: 'Comfort Cooling Loop B',
    },
  ],
  f2: [
    {
      id: 'r13',
      label: 'Central Campus Library',
      x: 4,
      y: 4,
      w: 90,
      h: 36,
      status: 'healthy',
      power: '9.2 kW',
      occupants: 64,
      system: 'Acoustic Precision AC',
    },
    {
      id: 'r14',
      label: 'Research Archive',
      x: 4,
      y: 44,
      w: 40,
      h: 48,
      status: 'healthy',
      power: '3.8 kW',
      occupants: 4,
      system: 'Climate Preservation Unit',
    },
    {
      id: 'r15',
      label: 'Server Core Alpha',
      x: 48,
      y: 44,
      w: 22,
      h: 24,
      status: 'inspection',
      power: '32.5 kW',
      occupants: 1,
      system: 'Dual CRAC Redundancy',
    },
    {
      id: 'r16',
      label: 'Network Ops Center',
      x: 74,
      y: 44,
      w: 20,
      h: 24,
      status: 'healthy',
      power: '8.1 kW',
      occupants: 6,
      system: 'Dedicated Inverter Split',
    },
    {
      id: 'r17',
      label: 'Telecom Riser',
      x: 48,
      y: 72,
      w: 46,
      h: 20,
      status: 'healthy',
      power: '2.5 kW',
      occupants: 0,
      system: 'Fiber Optic Distribution Hub',
    },
  ],
}

const STATUS_CONFIG = {
  healthy: {
    fill: 'rgba(16, 185, 129, 0.08)',
    stroke: 'rgba(16, 185, 129, 0.4)',
    activeStroke: 'rgba(16, 185, 129, 0.9)',
    text: '#059669',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    glow: 'glow-emerald',
    accent: 'emerald',
  },
  warning: {
    fill: 'rgba(245, 158, 11, 0.1)',
    stroke: 'rgba(245, 158, 11, 0.5)',
    activeStroke: 'rgba(245, 158, 11, 1)',
    text: '#d97706',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    glow: 'glow-primary',
    accent: 'amber',
  },
  fault: {
    fill: 'rgba(239, 68, 68, 0.12)',
    stroke: 'rgba(239, 68, 68, 0.6)',
    activeStroke: 'rgba(239, 68, 68, 1)',
    text: '#dc2626',
    badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    glow: 'glow-primary',
    accent: 'rose',
  },
  maintenance: {
    fill: 'rgba(59, 130, 246, 0.1)',
    stroke: 'rgba(59, 130, 246, 0.5)',
    activeStroke: 'rgba(59, 130, 246, 1)',
    text: '#2563eb',
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    glow: 'glow-secondary',
    accent: 'cyan',
  },
  inspection: {
    fill: 'rgba(147, 51, 234, 0.1)',
    stroke: 'rgba(147, 51, 234, 0.5)',
    activeStroke: 'rgba(147, 51, 234, 1)',
    text: '#9333ea',
    badge: 'bg-primary/10 text-secondary-600 dark:text-secondary-400 border-primary-500/20',
    glow: 'glow-primary',
    accent: 'primary',
  },
}

export function DigitalTwinShowcase() {
  const [floorData, setFloorData] = useState(INITIAL_ROOMS)
  const [activeFloor, setActiveFloor] = useState('gf')
  const [selectedRoom, setSelectedRoom] = useState(INITIAL_ROOMS.gf[1])
  const [hoveredRoom, setHoveredRoom] = useState(null)

  const currentRooms = floorData[activeFloor]

  const handleSimulateAnomaly = () => {
    if (!selectedRoom) return
    setFloorData((prev) => {
      const updated = { ...prev }
      updated[activeFloor] = updated[activeFloor].map((r) => {
        if (r.id === selectedRoom.id) {
          const nextStatus = r.status === 'healthy' ? 'fault' : 'healthy'
          const updatedRoom = {
            ...r,
            status: nextStatus,
            system: nextStatus === 'fault' ? 'Simulated Thermal Excursion Anomaly' : 'Normal Operating Baseline',
          }
          setSelectedRoom(updatedRoom)
          return updatedRoom
        }
        return r
      })
      return updated
    })
  }

  return (
    <section id="twin" className="py-24 bg-surface-base relative overflow-hidden">
      {/* Background Radial Spotlights */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[350px] bg-spotlight-primary opacity-50" />
        <div className="absolute top-1/2 right-1/4 w-[450px] h-[300px] bg-spotlight-secondary opacity-40" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[250px] bg-spotlight-cyan opacity-30" />
        <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[200px] bg-spotlight-emerald opacity-25" />
      </div>

      {/* Grid Beam Overlay with radial mask */}
      <div className="absolute inset-0 bg-grid-beam opacity-20 pointer-events-none" aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.24, 0, 0.38, 1] }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-panel border border-glass-border text-body-sm font-semibold text-secondary mb-4">
            <Radio size={14} className="text-secondary animate-pulse" />
            <span className="text-gradient-electric">Telemetry-Linked Digital Twin</span>
          </div>
          <h2 className="text-headline-lg text-ink font-bold" style={{ textWrap: 'balance' }}>
            Spatial Facility Intelligence in 2D & 3D
          </h2>
          <p className="mt-4 text-body-lg text-ink-muted leading-relaxed">
            Eliminate operational blindness. Inspect live telemetry, asset health, and emergency routes
            across every square meter of your campus buildings.
          </p>
        </motion.div>

        {/* Interactive Twin Workstation Panel */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.24, 0, 0.38, 1] }}
          className="widget overflow-hidden glass-panel border border-glass-border shadow-glow-secondary relative"
        >
          {/* Animated gradient border */}
          <div className="absolute inset-0 border-shimmer pointer-events-none" />

          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-glass-border bg-surface-sunken/50 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-secondary-400 to-primary text-white flex items-center justify-center font-bold text-[14px] shadow-glow-secondary">
                DT
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-body-md font-bold text-ink">Engineering & Sciences Quad — Block B</span>
                  <motion.span
                    className="text-[11px] font-mono px-2 py-0.5 rounded-full glass-panel border border-glass-border text-emerald-400 font-bold"
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    LIVE STREAM
                  </motion.span>
                </div>
                <p className="text-[11px] text-ink-faint">Click any zone or room to inspect live environmental telemetry</p>
              </div>
            </div>

            {/* Floor Switcher with layout animation */}
            <motion.div
              layout
              className="flex items-center gap-1 glass-panel border border-glass-border p-1 rounded-xl"
            >
              {FLOORS.map((f) => (
                <motion.button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setActiveFloor(f.id)
                    setSelectedRoom(floorData[f.id][0])
                  }}
                  layoutId={`floor-${f.id}`}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all',
                    activeFloor === f.id
                      ? 'bg-gradient-to-r from-secondary-400 to-primary text-white shadow-glow-secondary'
                      : 'text-ink-muted hover:text-ink hover:bg-surface/60',
                  )}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  {f.label.split('—')[0].trim()}
                </motion.button>
              ))}
            </motion.div>
          </div>

          {/* Main Visualizer & Telemetry Drawer Split */}
          <div className="grid lg:grid-cols-12 gap-0">
            {/* Left: SVG CAD Floor Plan (8 cols) */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="lg:col-span-8 p-6 bg-surface-base/30 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-glass-border"
            >
              <div className="relative rounded-2xl glass-panel border border-glass-border p-4 overflow-hidden min-h-[380px] flex items-center justify-center">
                {/* Architectural Blueprint Grid Pattern with radial mask */}
                <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="twinGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#twinGrid)" />
                </svg>

                {/* Grid beam pattern overlay */}
                <div className="absolute inset-0 bg-grid-beam opacity-30 pointer-events-none" aria-hidden="true" />

                {/* Interactive SVG Diagram */}
                <svg
                  viewBox="0 0 100 100"
                  className="w-full h-full max-h-[420px] select-none"
                  aria-label="Floor plan digital twin"
                >
                  {/* Outer Perimeter Wall */}
                  <rect
                    x="2"
                    y="2"
                    width="96"
                    height="96"
                    rx="2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    className="text-border-strong"
                  />

                  {/* Rooms */}
                  {currentRooms.map((room) => {
                    const cfg = STATUS_CONFIG[room.status] || STATUS_CONFIG.healthy
                    const isSelected = selectedRoom?.id === room.id
                    const isHovered = hoveredRoom === room.id

                    return (
                      <motion.g
                        key={room.id}
                        onClick={() => setSelectedRoom(room)}
                        onMouseEnter={() => setHoveredRoom(room.id)}
                        onMouseLeave={() => setHoveredRoom(null)}
                        className="cursor-pointer"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      >
                        {/* Room Area with status glow */}
                        <motion.rect
                          x={room.x}
                          y={room.y}
                          width={room.w}
                          height={room.h}
                          rx="1.5"
                          fill={cfg.fill}
                          stroke={isSelected ? cfg.activeStroke : isHovered ? cfg.text : cfg.stroke}
                          strokeWidth={isSelected ? '1.5' : isHovered ? '1.0' : '0.6'}
                          strokeDasharray={isSelected ? 'none' : room.status === 'maintenance' ? '2 1' : 'none'}
                          animate={{
                            fill: isSelected || isHovered ? `rgba(${cfg.text}, 0.2)` : cfg.fill,
                            strokeWidth: isSelected ? 1.5 : isHovered ? 1.0 : 0.6,
                          }}
                          transition={{ duration: 0.2 }}
                        />

                        {/* Room Status Indicator Dot with pulse ring */}
                        <motion.circle
                          cx={room.x + room.w - 3.5}
                          cy={room.y + 3.5}
                          r={isSelected ? 2.5 : 1.8}
                          fill={cfg.text}
                          className={clsx(room.status === 'fault' ? 'status-beacon' : '', isSelected ? 'opacity-100' : 'opacity-70')}
                          animate={{
                            scale: room.status === 'fault' ? [1, 1.3, 1] : 1,
                            opacity: room.status === 'fault' ? [1, 0.5, 1] : 1,
                          }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        />

                        {/* Room Name */}
                        <text
                          x={room.x + room.w / 2}
                          y={room.y + room.h / 2 - 1}
                          textAnchor="middle"
                          fontSize="3.2"
                          fill="currentColor"
                          className="text-ink font-semibold"
                          style={{ pointerEvents: 'none' }}
                        >
                          {room.label}
                        </text>

                        {/* Status indicator in room */}
                        <text
                          x={room.x + room.w / 2}
                          y={room.y + room.h / 2 + 3.2}
                          textAnchor="middle"
                          fontSize="2.4"
                          fill={cfg.text}
                          fontWeight="600"
                          style={{ pointerEvents: 'none' }}
                        >
                          {room.status.charAt(0).toUpperCase() + room.status.slice(1)}
                        </text>
                      </motion.g>
                    )
                  })}
                </svg>
              </div>

              {/* Status Legend */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-glass-border"
              >
                <div className="flex flex-wrap items-center gap-4 text-[12px]">
                  {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
                    <motion.div
                      key={status}
                      className="flex items-center gap-1.5 group"
                      whileHover={{ scale: 1.05 }}
                    >
                      <motion.span
                        className="w-2.5 h-2.5 rounded-full status-beacon"
                        style={{ backgroundColor: cfg.text, borderColor: cfg.text }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.7, type: 'spring', stiffness: 300 }}
                      />
                      <span className="capitalize text-ink-muted font-medium">{status}</span>
                    </motion.div>
                  ))}
                </div>
                <div className="text-[11px] text-ink-faint text-gradient-cyber font-medium">Spatial Resolution: ±0.1m</div>
              </motion.div>
            </motion.div>

            {/* Right: Selected Room Telemetry Inspector (4 cols) */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="lg:col-span-4 p-6 bg-surface/30 flex flex-col justify-between space-y-6 relative z-10"
            >
              {selectedRoom ? (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.4 }}
                    className="space-y-5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-mono uppercase tracking-wider text-ink-faint">
                          Zone Inspector
                        </span>
                        <h3 className="text-headline-md font-bold text-ink">{selectedRoom.label}</h3>
                      </div>
                      <motion.span
                        className={clsx(
                          'text-label-caps uppercase px-2.5 py-1 rounded-full font-bold border status-beacon',
                          STATUS_CONFIG[selectedRoom.status]?.badge,
                        )}
                        style={{ borderColor: STATUS_CONFIG[selectedRoom.status]?.text }}
                        animate={{ scale: selectedRoom.status === 'fault' ? [1, 1.05, 1] : 1 }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        {selectedRoom.status}
                      </motion.span>
                    </div>

                    {/* Telemetry Metrics Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { icon: Users, color: 'emerald', label: 'Occupancy', value: `${selectedRoom.occupants} persons` },
                        { icon: Zap, color: 'amber', label: 'Active Power Draw', value: selectedRoom.power },
                        { icon: Activity, color: 'secondary', label: 'System Status', value: selectedRoom.status.charAt(0).toUpperCase() + selectedRoom.status.slice(1) },
                        { icon: Sliders, color: 'cyan', label: 'Asset Health', value: selectedRoom.system },
                      ].map((metric, idx) => { const a = accent(metric.color); return (
                        <motion.div
                          key={metric.label}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.55 + idx * 0.05, type: 'spring', stiffness: 300 }}
                          className="p-3 rounded-xl glass-panel border border-glass-border group relative overflow-hidden"
                        >
                          {/* Glow accent on hover */}
                          <div className={clsx('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none', a.glow)} />
                          <div className="relative z-10 flex items-center gap-1.5 text-[11px] text-ink-faint mb-1">
                            <metric.icon size={13} className={clsx(a.text400)} />
                            <span>{metric.label}</span>
                          </div>
                          <p className="text-body-sm font-bold text-ink relative z-10 truncate">{metric.value}</p>
                        </motion.div>
                      )})}
                    </div>

                    {/* Active Subsystem Log */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.7 }}
                      className="p-3.5 rounded-xl glass-panel border border-glass-border relative overflow-hidden"
                    >
                      <div className={clsx('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none', STATUS_CONFIG[selectedRoom.status]?.glow)} />
                      <div className="relative z-10">
                        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider mb-1">
                          Target Equipment Subsystem
                        </p>
                        <p className="text-body-sm font-semibold text-ink text-gradient-electric">{selectedRoom.system}</p>
                      </div>
                    </motion.div>

                    {/* Simulate Anomaly Toggle */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.75 }}
                      className="pt-2"
                    >
                      <button
                        type="button"
                        onClick={handleSimulateAnomaly}
                        className="w-full btn btn-outline btn-sm h-10 flex items-center justify-center gap-2 text-secondary hover:text-secondary-300 border-secondary/30 hover:border-secondary hover:bg-secondary/10 transition-all duration-300 border-shimmer"
                      >
                        <RefreshCw size={13} />
                        <span>
                          Simulate {selectedRoom.status === 'healthy' ? 'Thermal Anomaly' : 'Recovery Reset'}
                        </span>
                      </button>
                      <p className="text-[11px] text-ink-faint text-center mt-1.5">
                        Toggle to see instant map recoloring and alert dispatch
                      </p>
                    </motion.div>
                  </motion.div>
                </>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="py-20 text-center text-ink-faint"
                >
                  Select a zone to view telemetry
                </motion.div>
              )}

              {/* Digital Twin Capabilities Footnote */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="pt-4 border-t border-glass-border text-[11px] text-ink-faint flex items-center justify-between"
              >
                <span className="text-gradient-cyber font-medium">BIM/Revit LOD-400 Ingestion</span>
                <span className="text-gradient-emerald font-medium">Sub-second IoT Sync</span>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}