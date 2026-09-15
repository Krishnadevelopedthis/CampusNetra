import { useState } from 'react'
import {
  Brain,
  Zap,
  TrendingUp,
  AlertCircle,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Clock,
  Send,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import clsx from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'

const SAMPLE_PROMPTS = [
  {
    id: 'lab',
    label: '🧪 Chemistry Lab Chemical Odor',
    text: 'Fume hood alarm beeping in Lab 304 with strong chemical odor. Airflow gauge reading below 40 FPM.',
    category: 'Hazardous Materials & Ventilation',
    priority: 'P1 - Critical Safety',
    urgencyScore: '99.4%',
    sla: '15 mins response',
    crew: 'Hazardous Materials Safety & HVAC Team',
    steps: [
      'Trigger localized Lab 304 ventilation exhaust purge',
      'Notify Chemical Hygiene Officer & Lab Attendant',
      'Isolate HVAC supply duct to adjacent classrooms',
      'Dispatch Technician with Class B Air Scrubber kit',
    ],
  },
  {
    id: 'power',
    label: '⚡ Substation Transformer Alert',
    text: 'Substation B transformer showing abnormal thermal rise with harmonic vibration.',
    category: 'Critical Electrical Infrastructure',
    priority: 'P1 - Urgent Preventative',
    urgencyScore: '98.1%',
    sla: '20 mins response',
    crew: 'Electrical Infrastructure Specialist',
    steps: [
      'Initiate automatic load shedding for Block C & D secondary rings',
      'Verify thermal camera imaging stream at Substation B',
      'Dispatch Electrical Emergency response team',
    ],
  },
  {
    id: 'plumbing',
    label: '🚰 Washroom Water Surge',
    text: 'High-pressure water pipe burst on 3rd floor washroom, water overflowing toward server closet conduit.',
    category: 'Plumbing & Asset Protection',
    priority: 'P2 - High Urgency',
    urgencyScore: '94.7%',
    sla: '30 mins response',
    crew: 'Facility Plumbing Rapid Dispatch',
    steps: [
      'Locate 3rd floor North Wing isolation valve in Digital Twin',
      'Remotely notify Floor Warden to seal server closet threshold',
      'Dispatch emergency plumber with submersible extraction pump',
    ],
  },
  {
    id: 'hvac',
    label: '❄️ Server Room AC Anomaly',
    text: 'Server Room 1 primary precision air conditioning fan failure. Rack intake ambient conditions exceeded thresholds.',
    category: 'Critical IT Environmental Controls',
    priority: 'P2 - Environmental Threshold',
    urgencyScore: '96.2%',
    sla: '25 mins response',
    crew: 'Precision HVAC & Data Center Ops',
    steps: [
      'Spin up secondary backup CRAC condenser loop',
      'Alert Systems Administrator of thermal warning status',
      'Dispatch HVAC technician for inverter fan motor replacement',
    ],
  },
]

export function AISection() {
  const [activePrompt, setActivePrompt] = useState(SAMPLE_PROMPTS[0])
  const [customText, setCustomText] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const handleSelectPrompt = (prompt) => {
    setIsAnalyzing(true)
    setActivePrompt(prompt)
    setTimeout(() => {
      setIsAnalyzing(false)
    }, 350)
  }

  const handleCustomSubmit = (e) => {
    e.preventDefault()
    if (!customText.trim()) return
    setIsAnalyzing(true)

    // Generate dynamic heuristic triage response for user prompt
    setTimeout(() => {
      setActivePrompt({
        id: 'custom',
        label: '✨ Custom Incident Report',
        text: customText,
        category: 'Campus Operational Management',
        priority: 'P2 - Auto-Assessed',
        urgencyScore: '92.8%',
        sla: '30 mins response',
        crew: 'Assigned Campus Response Unit',
        steps: [
          'Natural language parameters indexed and geo-pinned',
          'SLA timer started and logged into audit trail',
          'Assigned to available technician on duty',
        ],
      })
      setIsAnalyzing(false)
    }, 450)
  }

  return (
    <section id="ai" className="py-24 bg-surface-base relative overflow-hidden">
      {/* Background Radial Spotlights */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[350px] bg-spotlight-primary opacity-50" />
        <div className="absolute top-1/2 right-1/4 w-[450px] h-[300px] bg-spotlight-secondary opacity-40" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[250px] bg-spotlight-cyan opacity-30" />
      </div>

      {/* Grid Beam Overlay */}
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
            <Sparkles size={14} className="text-secondary" />
            <span className="text-gradient-electric">Interactive AI Engine Sandbox</span>
          </div>
          <h2 className="text-headline-lg text-ink font-bold" style={{ textWrap: 'balance' }}>
            Autonomous Incident Triage & Smart Dispatch
          </h2>
          <p className="mt-4 text-body-lg text-ink-muted leading-relaxed">
            Test CampusNetra's AI triage model in real time. Choose an incident scenario or type your own
            to see instant classification, urgency scoring, SLA estimation, and technician routing.
          </p>
        </motion.div>

        {/* 21st.dev Interactive Sandbox Grid */}
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Input and Presets (5 cols) */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="lg:col-span-5 space-y-4"
          >
            <div className="widget p-5 glass-panel border border-glass-border relative overflow-hidden group">
              {/* Glow accent on hover */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none glow-secondary" />

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-body-sm font-bold text-ink uppercase tracking-wider">
                    1. Choose an Incident Scenario
                  </span>
                  <span className="text-[11px] text-ink-faint">Click to simulate</span>
                </div>

                <div className="space-y-2">
                  {SAMPLE_PROMPTS.map((prompt) => {
                    const isSelected = activePrompt.id === prompt.id
                    return (
                      <motion.button
                        key={prompt.id}
                        type="button"
                        onClick={() => handleSelectPrompt(prompt)}
                        whileHover={{ x: 4 }}
                        whileTap={{ scale: 0.98 }}
                        className={clsx(
                          'w-full text-left p-3 rounded-xl border text-body-sm transition-all duration-200 flex flex-col gap-1 relative overflow-hidden',
                          isSelected
                            ? 'bg-gradient-to-r from-secondary-400/10 to-primary/10 border-secondary/50 ring-1 ring-secondary-400/30'
                            : 'bg-surface-sunken/60 hover:bg-surface-sunken border-border-subtle hover:border-secondary/30',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-ink">{prompt.label}</span>
                          {isSelected && (
                            <motion.span
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="text-[11px] font-bold text-secondary"
                            >
                              Active
                            </motion.span>
                          )}
                        </div>
                        <p className="text-[12px] text-ink-muted line-clamp-2">{prompt.text}</p>
                      </motion.button>
                    )
                  })}
                </div>

                {/* Custom Input */}
                <div className="mt-4 pt-4 border-t border-glass-border">
                  <p className="text-[12px] font-semibold text-ink mb-2">Or type custom incident details:</p>
                  <form onSubmit={handleCustomSubmit} className="flex gap-2">
                    <input
                      type="text"
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      placeholder="e.g. Elevator stuck on floor 4..."
                      className="flex-1 input h-9 text-[13px] glass-panel border-glass-border bg-surface-sunken/50"
                    />
                    <motion.button
                      type="submit"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="btn btn-primary btn-sm h-9 px-3 flex items-center gap-1.5 border-shimmer shadow-glow-secondary"
                    >
                      <Send size={13} />
                      <span>Run</span>
                    </motion.button>
                  </form>
                </div>
              </div>
            </div>

            {/* AI Capabilities Cards */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="grid grid-cols-2 gap-3"
            >
              {[
                { icon: Brain, title: 'Zero Manual Triage', sub: '99.4% precision routing', color: 'secondary' },
                { icon: Clock, title: 'Adaptive SLAs', sub: 'Dynamic hazard weighting', color: 'primary' },
                { icon: TrendingUp, title: 'Pattern Detection', sub: 'Early failure warnings', color: 'cyan' },
                { icon: Zap, title: 'Instant Dispatch', sub: '< 200ms processing', color: 'amber' },
              ].map(({ icon: Icon, title, sub, color }, idx) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.45 + idx * 0.05, type: 'spring', stiffness: 300 }}
                  whileHover={{ y: -2 }}
                  className="p-3.5 rounded-xl glass-panel border border-glass-border relative overflow-hidden group"
                >
                  <div className={clsx('absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none', `glow-${color}`)} />
                  <div className="relative z-10">
                    <div className={clsx('w-7 h-7 rounded-lg border flex items-center justify-center text-secondary mb-2', `border-${color}-400/30`, `bg-${color}-500/10`)}>
                      <Icon size={14} className={clsx(`text-${color}-400`)} />
                    </div>
                    <p className="text-body-sm font-semibold text-ink">{title}</p>
                    <p className="text-[11px] text-ink-faint mt-0.5">{sub}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right Column: AI Triage Output Card (7 cols) */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="lg:col-span-7"
          >
            <div className="relative widget overflow-hidden glass-panel border border-glass-border p-6 shadow-glow-secondary">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-glass-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-secondary-400 to-primary text-white flex items-center justify-center shadow-glow-secondary">
                    <Brain size={18} />
                  </div>
                  <div>
                    <h3 className="text-headline-md text-ink font-bold">AI Triage Output Analysis</h3>
                    <p className="text-[11px] text-ink-faint">Real-time model reasoning & automated work order plan</p>
                  </div>
                </div>

                <motion.div
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="flex items-center gap-2"
                >
                  <span className="text-[11px] font-mono text-secondary bg-secondary/10 border border-secondary/30 px-2.5 py-1 rounded-full font-bold">
                    CONFIDENCE: {activePrompt.urgencyScore}
                  </span>
                </motion.div>
              </div>

              {/* Scanning Overlay State */}
              <AnimatePresence mode="wait">
                {isAnalyzing ? (
                  <motion.div
                    key="analyzing"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05 }}
                    transition={{ duration: 0.2 }}
                    className="py-20 flex flex-col items-center justify-center text-center space-y-3"
                  >
                    <motion.div
                      className="w-12 h-12 border-3 border-secondary-500 border-t-transparent rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                    <p className="text-body-md font-medium text-ink">Analyzing incident semantics & hazard radius…</p>
                    <p className="text-[12px] text-ink-faint">Evaluating SLA matrix and technician availability</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="output"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="pt-5 space-y-5"
                  >
                    {/* Raw Input Preview */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="p-3.5 rounded-xl glass-panel border border-glass-border"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-1">
                        Raw Report Ingestion
                      </p>
                      <p className="text-body-sm text-ink italic font-medium">"{activePrompt.text}"</p>
                    </motion.div>

                    {/* Metadata Badges Grid */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="grid sm:grid-cols-3 gap-3"
                    >
                      <div className="p-3 rounded-xl glass-panel border border-glass-border">
                        <span className="text-[11px] text-ink-faint block">Category</span>
                        <span className="text-body-sm font-bold text-ink mt-0.5 block truncate">
                          {activePrompt.category}
                        </span>
                      </div>

                      <div className={clsx('p-3 rounded-xl border status-beacon', 'bg-warning-bg/60 border-warning-border')}>
                        <span className="text-[11px] text-warning-text block font-medium">Urgency & Priority</span>
                        <span className="text-body-sm font-bold text-warning-text mt-0.5 block truncate">
                          {activePrompt.priority}
                        </span>
                      </div>

                      <div className={clsx('p-3 rounded-xl border status-beacon', 'bg-success-bg/60 border-success-border')}>
                        <span className="text-[11px] text-success-text block font-medium">Target Response SLA</span>
                        <span className="text-body-sm font-bold text-success-text mt-0.5 block truncate">
                          {activePrompt.sla}
                        </span>
                      </div>
                    </motion.div>

                    {/* Routing Target */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className={clsx('p-4 rounded-xl border flex items-center justify-between', 'bg-info-bg/40 border-info-border')}
                    >
                      <div>
                        <p className="text-[11px] font-semibold text-info-text uppercase tracking-wider">
                          Automated Crew Dispatch Target
                        </p>
                        <p className="text-body-md font-bold text-ink mt-0.5">{activePrompt.crew}</p>
                      </div>
                      <motion.span
                        animate={{ scale: [1, 1.02, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="text-label-caps bg-gradient-to-r from-secondary-400 to-primary text-white px-2.5 py-1 rounded-full font-bold border-shimmer shadow-glow-secondary"
                      >
                        Route Armed
                      </motion.span>
                    </motion.div>

                    {/* Auto-Generated Action Checklist */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 }}
                    >
                      <p className="text-body-sm font-bold text-ink mb-2.5 flex items-center gap-1.5">
                        <CheckCircle2 size={15} className="text-secondary" />
                        <span>Synthesized Emergency Action Checklist</span>
                      </p>
                      <div className="space-y-2">
                        {activePrompt.steps.map((step, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + idx * 0.05 }}
                            className="flex items-start gap-2.5 p-2.5 rounded-lg glass-panel border border-glass-border text-body-sm"
                          >
                            <span className={clsx('w-5 h-5 rounded-md flex items-center justify-center font-mono text-[11px] font-bold flex-shrink-0 mt-0.5', `bg-${idx % 2 === 0 ? 'secondary' : 'primary'}-500/20`, `text-${idx % 2 === 0 ? 'secondary' : 'primary'}-400`)}>
                              {idx + 1}
                            </span>
                            <span className="text-ink font-medium text-[13px]">{step}</span>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>

                    {/* Footnote */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="pt-2 flex items-center justify-between text-[11px] text-ink-faint border-t border-glass-border"
                    >
                      <span className="text-gradient-cyber font-medium">Model: CampusNetra Operational LLM v2</span>
                      <span className="text-gradient-emerald font-medium">Audit Log ID: #AI-{Math.floor(Math.random() * 8000 + 1000)}</span>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}