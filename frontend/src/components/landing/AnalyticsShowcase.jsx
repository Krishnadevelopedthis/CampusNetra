import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts'
import {
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Calculator,
  ArrowUpRight,
  ShieldCheck,
  Building,
  Sparkles,
} from 'lucide-react'
import clsx from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'

const DEPARTMENTS = [
  {
    id: 'all',
    label: 'Campus-Wide Master',
    accentColor: 'indigo',
    glowColor: 'glow-indigo',
    metrics: [
      { label: 'Overall SLA Compliance', value: '94.2%', sub: 'Target: ≥ 85%', trend: '+3.4%', isPositive: true },
      { label: 'Avg First-Response Time', value: '18 mins', sub: 'Target: ≤ 45m', trend: '-12 mins', isPositive: true },
      { label: 'Avg Full Resolution', value: '3.8 hrs', sub: 'Target: ≤ 6.0h', trend: '-1.4 hrs', isPositive: true },
      { label: 'Prevented SLA Breaches', value: '142', sub: 'This quarter', trend: '+28%', isPositive: true },
    ],
    chartData: [
      { month: 'Jan', compliance: 84, responseTime: 38, target: 85 },
      { month: 'Feb', compliance: 86, responseTime: 32, target: 85 },
      { month: 'Mar', compliance: 89, responseTime: 26, target: 85 },
      { month: 'Apr', compliance: 88, responseTime: 24, target: 85 },
      { month: 'May', compliance: 92, responseTime: 20, target: 85 },
      { month: 'Jun', compliance: 95, responseTime: 18, target: 85 },
    ],
  },
  {
    id: 'electrical',
    label: 'Electrical & Power',
    accentColor: 'amber',
    glowColor: 'glow-violet',
    metrics: [
      { label: 'Electrical SLA Compliance', value: '98.1%', sub: 'Target: ≥ 90%', trend: '+4.1%', isPositive: true },
      { label: 'Avg First-Response Time', value: '12 mins', sub: 'Critical safety', trend: '-8 mins', isPositive: true },
      { label: 'Avg Full Resolution', value: '2.1 hrs', sub: 'Target: ≤ 4.0h', trend: '-0.9 hrs', isPositive: true },
      { label: 'Transformer Uptime', value: '99.98%', sub: 'Zero blackouts', trend: 'Optimal', isPositive: true },
    ],
    chartData: [
      { month: 'Jan', compliance: 90, responseTime: 22, target: 90 },
      { month: 'Feb', compliance: 92, responseTime: 19, target: 90 },
      { month: 'Mar', compliance: 94, responseTime: 16, target: 90 },
      { month: 'Apr', compliance: 95, responseTime: 14, target: 90 },
      { month: 'May', compliance: 97, responseTime: 13, target: 90 },
      { month: 'Jun', compliance: 98, responseTime: 12, target: 90 },
    ],
  },
  {
    id: 'hvac',
    label: 'Precision HVAC & Labs',
    accentColor: 'cyan',
    glowColor: 'glow-cyan',
    metrics: [
      { label: 'HVAC SLA Compliance', value: '92.6%', sub: 'Target: ≥ 85%', trend: '+5.2%', isPositive: true },
      { label: 'Avg First-Response Time', value: '22 mins', sub: 'Target: ≤ 40m', trend: '-15 mins', isPositive: true },
      { label: 'Avg Full Resolution', value: '4.5 hrs', sub: 'Target: ≤ 6.0h', trend: '-1.8 hrs', isPositive: true },
      { label: 'Thermal Delta Stability', value: '±0.4', sub: 'Server clusters', trend: 'Verified', isPositive: true },
    ],
    chartData: [
      { month: 'Jan', compliance: 79, responseTime: 44, target: 85 },
      { month: 'Feb', compliance: 82, responseTime: 36, target: 85 },
      { month: 'Mar', compliance: 85, responseTime: 30, target: 85 },
      { month: 'Apr', compliance: 88, responseTime: 27, target: 85 },
      { month: 'May', compliance: 91, responseTime: 24, target: 85 },
      { month: 'Jun', compliance: 93, responseTime: 22, target: 85 },
    ],
  },
  {
    id: 'it',
    label: 'IT & Server Infrastructure',
    accentColor: 'emerald',
    glowColor: 'glow-emerald',
    metrics: [
      { label: 'Network & IT Compliance', value: '97.4%', sub: 'Target: ≥ 90%', trend: '+2.8%', isPositive: true },
      { label: 'Avg First-Response Time', value: '9 mins', sub: 'Target: ≤ 20m', trend: '-6 mins', isPositive: true },
      { label: 'Avg Full Resolution', value: '1.6 hrs', sub: 'Target: ≤ 3.0h', trend: '-0.7 hrs', isPositive: true },
      { label: 'Rack Thermal Alert Speed', value: '180ms', sub: 'Sensor telemetry', trend: 'Instant', isPositive: true },
    ],
    chartData: [
      { month: 'Jan', compliance: 91, responseTime: 18, target: 90 },
      { month: 'Feb', compliance: 93, responseTime: 15, target: 90 },
      { month: 'Mar', compliance: 95, responseTime: 12, target: 90 },
      { month: 'Apr', compliance: 96, responseTime: 11, target: 90 },
      { month: 'May', compliance: 97, responseTime: 10, target: 90 },
      { month: 'Jun', compliance: 98, responseTime: 9, target: 90 },
    ],
  },
]

export function AnalyticsShowcase() {
  const [selectedDeptId, setSelectedDeptId] = useState('all')
  const [activeChartTab, setActiveChartTab] = useState('compliance')

  // Interactive ROI Calculator State
  const [studentCount, setStudentCount] = useState(6500)
  const [campusBuildings, setCampusBuildings] = useState(14)

  const activeDept = DEPARTMENTS.find((d) => d.id === selectedDeptId) || DEPARTMENTS[0]

  // Dynamic Heuristic ROI Calculations
  const estimatedAnnualIncidents = Math.round(studentCount * 0.42 + campusBuildings * 65)
  const hoursSavedPerYear = Math.round(estimatedAnnualIncidents * 2.4)
  const estimatedCostReduction = (hoursSavedPerYear * 450).toLocaleString('en-IN')
  const breachesPrevented = Math.round(estimatedAnnualIncidents * 0.18)

  return (
    <section id="analytics" className="py-24 bg-surface-base relative overflow-hidden">
      {/* Background Radial Spotlights */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[350px] bg-spotlight-primary opacity-50" />
        <div className="absolute top-1/2 right-1/4 w-[450px] h-[300px] bg-spotlight-secondary opacity-40" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[250px] bg-spotlight-cyan opacity-30" />
        <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[200px] bg-spotlight-emerald opacity-25" />
      </div>

      {/* Grid Beam Overlay */}
      <div className="absolute inset-0 bg-grid-beam opacity-20 pointer-events-none" aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.24, 0, 0.38, 1] }}
          className="text-center max-w-3xl mx-auto mb-14"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-panel border border-glass-border text-body-sm font-semibold text-secondary mb-4">
            <Sparkles size={14} className="text-indigo-400" />
            <span className="text-gradient-electric">Telemetry & Operational Intelligence</span>
          </div>
          <h2 className="text-headline-lg text-ink font-bold" style={{ textWrap: 'balance' }}>
            Data-Driven Governance & SLA Analytics
          </h2>
          <p className="mt-4 text-body-lg text-ink-muted leading-relaxed">
            Monitor real-time compliance metrics, resolution speed curves, and calculate your campus's
            operational efficiency gains across facility departments.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 text-[12px] text-ink-faint">
            <motion.span
              className="w-2 h-2 rounded-full bg-indigo-400 status-beacon"
              animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0.2, 0.6] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className="text-gradient-cyber font-medium">Interactive telemetry dashboard with simulated campus metrics</span>
          </div>
        </motion.div>

        {/* Department Switcher Tabs with Framer Motion layout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="flex justify-center mb-8"
        >
          <motion.div
            layout
            className="inline-flex glass-panel border border-glass-border p-1.5 rounded-2xl gap-1.5 flex-wrap justify-center shadow-glow-indigo"
          >
            {DEPARTMENTS.map((dept) => {
              const isSelected = dept.id === selectedDeptId
              return (
                <motion.button
                  key={dept.id}
                  type="button"
                  onClick={() => setSelectedDeptId(dept.id)}
                  layoutId={`dept-${dept.id}`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className={clsx(
                    'px-4 py-2 rounded-xl text-body-sm font-semibold transition-all duration-200 flex items-center gap-2 relative overflow-hidden',
                    isSelected
                      ? 'bg-gradient-to-r from-indigo-500/20 to-violet-500/20 text-indigo-400 border-indigo-400/30 shadow-glow-indigo'
                      : 'text-ink-muted hover:text-ink hover:bg-surface/60',
                  )}
                >
                  <Building size={14} className={clsx('transition-colors', isSelected ? `text-${dept.accentColor}-400` : 'text-ink-faint')} />
                  <span>{dept.label}</span>
                  {/* Active indicator */}
                  <motion.div
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                    initial={isSelected ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
                    animate={isSelected ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    style={{ backgroundColor: `var(--c-${dept.accentColor}-400)` }}
                  />
                </motion.button>
              )
            })}
          </motion.div>
        </motion.div>

        {/* Dynamic Metric Cards Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10"
        >
          {activeDept.metrics.map(({ label, value, sub, trend, isPositive }, idx) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + idx * 0.05, duration: 0.4 }}
              whileHover={{ y: -4 }}
              className="widget p-5 glass-panel border border-glass-border relative overflow-hidden group"
            >
              <div className={clsx('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none', activeDept.glowColor)} />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-medium text-ink-faint truncate">{label}</p>
                  <motion.span
                    className={clsx(
                      'text-[11px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5',
                      isPositive ? 'bg-success-bg/50 text-success-text border border-success-border/30' : 'bg-warning-bg/50 text-warning-text border border-warning-border/30',
                    )}
                    whileHover={{ scale: 1.05 }}
                  >
                    <ArrowUpRight size={11} />
                    {trend}
                  </motion.span>
                </div>
                <p className="text-display-metrics text-ink font-bold tracking-tight text-gradient-electric">{value}</p>
                <p className="text-[12px] text-ink-muted mt-1 font-medium">{sub}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Analytics Main Grid: Chart + Live ROI Simulator */}
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left Chart Card (7 cols) */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="lg:col-span-7 widget p-6 glass-panel border border-glass-border shadow-glow-indigo relative overflow-hidden group"
          >
            <div className={clsx('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none', activeDept.glowColor)} />
            <div className="relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-glass-border mb-6">
                <div>
                  <h3 className="text-headline-md text-ink font-bold flex items-center gap-2">
                    <motion.span
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className={clsx(`text-${activeDept.accentColor}-400`)}
                    >
                      ●
                    </motion.span>
                    <span>{activeDept.label} Telemetry Curve</span>
                  </h3>
                  <p className="text-[12px] text-ink-faint">Monthly audit compliance vs target baseline threshold</p>
                </div>

                {/* Chart Mode Toggle */}
                <motion.div
                  layout
                  className="flex glass-panel border border-glass-border p-1 rounded-xl"
                >
                  <motion.button
                    type="button"
                    onClick={() => setActiveChartTab('compliance')}
                    layoutId={`chart-${activeChartTab}`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className={clsx(
                      'px-3 py-1 rounded-lg text-[12px] font-semibold transition-colors',
                      activeChartTab === 'compliance'
                        ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-glow-indigo'
                        : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    Compliance %
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setActiveChartTab('response')}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className={clsx(
                      'px-3 py-1 rounded-lg text-[12px] font-semibold transition-colors',
                      activeChartTab === 'response'
                        ? 'bg-gradient-to-r from-cyan-500 to-indigo-500 text-white shadow-glow-cyan'
                        : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    Response Speed
                  </motion.button>
                </motion.div>
              </div>

              {/* Recharts Render */}
              <AnimatePresence mode="wait">
                {activeChartTab === 'compliance' ? (
                  <motion.div
                    key="compliance"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05 }}
                    transition={{ duration: 0.2 }}
                    className="h-72 w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={activeDept.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="complianceGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={`rgb(var(--c-${activeDept.accentColor}-400))`} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={`rgb(var(--c-${activeDept.accentColor}-400))`} stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                        <XAxis dataKey="month" stroke="rgb(100 116 139)" fontSize={12} tickLine={false} />
                        <YAxis stroke="rgb(100 116 139)" fontSize={12} tickLine={false} domain={[70, 100]} unit="%" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgb(var(--c-surface))',
                            borderColor: 'rgb(var(--c-border))',
                            borderRadius: '10px',
                            fontSize: '12px',
                            color: 'rgb(var(--c-ink))',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                          }}
                          formatter={(val) => [`${val}%`, 'Compliance Level']}
                        />
                        <Area
                          type="monotone"
                          dataKey="compliance"
                          stroke={`rgb(var(--c-${activeDept.accentColor}-400))`}
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#complianceGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </motion.div>
                ) : (
                  <motion.div
                    key="response"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05 }}
                    transition={{ duration: 0.2 }}
                    className="h-72 w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={activeDept.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                        <XAxis dataKey="month" stroke="rgb(100 116 139)" fontSize={12} tickLine={false} />
                        <YAxis stroke="rgb(100 116 139)" fontSize={12} tickLine={false} unit="m" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgb(var(--c-surface))',
                            borderColor: 'rgb(var(--c-border))',
                            borderRadius: '10px',
                            fontSize: '12px',
                            color: 'rgb(var(--c-ink))',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                          }}
                          formatter={(val) => [`${val} mins`, 'Avg First Response']}
                        />
                        <Bar dataKey="responseTime" fill={`rgb(var(--c-${activeDept.accentColor}-400))`} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-4 pt-3 border-t border-glass-border flex flex-wrap items-center justify-between text-[11px] text-ink-faint">
                <span className="flex items-center gap-1.5 text-gradient-emerald font-medium">
                  <ShieldCheck size={13} />
                  Audited against ISO 55001 Asset Management Framework
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded glass-panel border border-glass-border text-indigo-400">
                  SIMULATED DATASET
                </span>
              </div>
            </div>
          </motion.div>

          {/* Right Card: Interactive Campus ROI Calculator (5 cols) */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
            className="lg:col-span-5 widget p-6 glass-panel border border-glass-border shadow-glow-indigo relative overflow-hidden group"
          >
            <div className={clsx('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none', activeDept.glowColor)} />
            <div className="relative z-10">
              <div className="flex items-center gap-2.5 pb-4 border-b border-glass-border mb-5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center shadow-glow-indigo">
                  <Calculator size={18} />
                </div>
                <div>
                  <h3 className="text-headline-md text-ink font-bold">Campus ROI Calculator</h3>
                  <p className="text-[11px] text-ink-faint">Estimate monthly hours & SLA savings</p>
                </div>
              </div>

              {/* Sliders */}
              <div className="space-y-4 mb-6">
                <div>
                  <div className="flex justify-between text-body-sm mb-1.5">
                    <span className="font-semibold text-ink">Campus Population (Students & Staff)</span>
                    <span className="font-mono font-bold text-indigo-400">{studentCount.toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    min="1000"
                    max="25000"
                    step="500"
                    value={studentCount}
                    onChange={(e) => setStudentCount(Number(e.target.value))}
                    className="w-full h-2 bg-surface-sunken rounded-lg appearance-none cursor-pointer accent-indigo"
                  />
                  <div className="flex justify-between text-[11px] text-ink-faint mt-1">
                    <span>1,000</span>
                    <span>12,500</span>
                    <span>25,000+</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-body-sm mb-1.5">
                    <span className="font-semibold text-ink">Total Managed Buildings / Blocks</span>
                    <span className="font-mono font-bold text-indigo-400">{campusBuildings} Blocks</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="40"
                    step="1"
                    value={campusBuildings}
                    onChange={(e) => setCampusBuildings(Number(e.target.value))}
                    className="w-full h-2 bg-surface-sunken rounded-lg appearance-none cursor-pointer accent-indigo"
                  />
                  <div className="flex justify-between text-[11px] text-ink-faint mt-1">
                    <span>2</span>
                    <span>20</span>
                    <span>40</span>
                  </div>
                </div>
              </div>

              {/* Estimated Projected Results */}
              <motion.div
                className="p-4 rounded-xl glass-panel border border-glass-border space-y-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-ink-muted">Estimated Annual Incidents</span>
                  <span className="text-body-sm font-mono font-bold text-ink text-gradient-electric">{estimatedAnnualIncidents} events</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-ink-muted">Annual Technician Labor Hours Saved</span>
                  <span className="text-body-sm font-mono font-bold text-success-text">+{hoursSavedPerYear} hrs/yr</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-ink-muted">Critical SLA Breaches Prevented</span>
                  <span className="text-body-sm font-mono font-bold text-indigo-400">~{breachesPrevented} incidents</span>
                </div>
                <div className="pt-2 border-t border-glass-border flex items-center justify-between">
                  <span className="text-body-sm font-bold text-ink">Est. Operational Value</span>
                  <span className="text-headline-md font-bold text-ink font-mono text-gradient-electric">₹{estimatedCostReduction}</span>
                </div>
              </motion.div>

              <div className="mt-4 text-[11px] text-ink-faint text-center text-gradient-cyber font-medium">
                Based on standardized campus facility benchmark models & automated triage dispatch times.
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}