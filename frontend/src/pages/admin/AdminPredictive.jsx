import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Info, TrendingUp, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  Button, EmptyState, ErrorState, Metric, Spinner, Widget, toast,
} from '@/components/ui'
import { api } from '@/lib/api'
import { dt } from '@/lib/format'

const BAND_STYLE = {
  high: 'bg-danger-bg text-danger-text',
  medium: 'bg-warning-bg text-warning-text',
  low: 'bg-neutral-bg text-neutral-text',
}

const SIGNAL_LABEL = {
  faults: 'Fault history', age: 'Age vs life', service: 'Service overdue',
  mtbf: 'Failure interval', warranty: 'Warranty',
}

export default function AdminPredictive() {
  const qc = useQueryClient()
  const [threshold, setThreshold] = useState(0.55)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['predictive', threshold],
    queryFn: () => api.get('/admin/predictive', { params: { min_risk: threshold, limit: 30 } }),
  })

  const raise = useMutation({
    mutationFn: (assetId) => api.post('/admin/predictive/work-order', { asset_id: assetId }),
    onSuccess: (d) => {
      toast.success(d.message)
      qc.invalidateQueries({ queryKey: ['predictive'] })
      qc.invalidateQueries({ queryKey: ['work-orders'] })
    },
    onError: (err) => toast.error(err.detail || 'Could not raise work order'),
  })

  if (isLoading) return <Spinner label="Scoring assets…" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="High risk" value={data.summary.high_risk}
                accent={data.summary.high_risk > 0 ? '#ef4444' : '#10b981'} />
        <Metric label="Medium risk" value={data.summary.medium_risk} accent="#f59e0b" />
        <Metric label="Already scheduled" value={data.summary.already_scheduled} accent="#3b82f6" />
        <Metric label="Assets flagged" value={data.predictions.length} accent="#1e1b4b" />
      </div>

      {/* How the score is built — a manager has to justify spending on a working machine. */}
      <div className="ai-surface p-widget">
        <div className="flex items-start gap-3">
          <Info size={18} className="text-secondary shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-body-md font-medium text-ink">
              How this score is built ({data.model})
            </p>
            <p className="text-body-md text-ink-muted mt-1">
              An interpretable weighted model, not a black box — every number below
              comes with the signals that produced it.
            </p>
            <div className="flex flex-wrap gap-2 mt-2.5">
              {Object.entries(data.weights).map(([k, v]) => (
                <span key={k} className="pill bg-surface border border-border-subtle text-ink-muted text-body-sm">
                  {k.replace(/_/g, ' ')} <strong className="text-ink">{Math.round(v * 100)}%</strong>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Widget
        title={<span className="flex items-center gap-2"><TrendingUp size={17} /> Maintenance Forecast</span>}
        subtitle={`Generated ${dt(data.generated_at)}`}
        action={
          <div className="flex items-center gap-2">
            <label className="text-body-sm text-ink-muted whitespace-nowrap">
              Threshold {Math.round(threshold * 100)}%
            </label>
            <input
              type="range" min="0.2" max="0.9" step="0.05" value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-28 accent-secondary"
            />
          </div>
        }
        bodyClass={data.predictions.length ? 'p-widget' : 'p-0'}
      >
        {data.predictions.length === 0 ? (
          <EmptyState
            icon={Wrench} title="Nothing above the threshold"
            description="No asset currently scores high enough to warrant preventive work. Lower the threshold to see borderline cases."
          />
        ) : (
          <div className="space-y-3">
            {data.predictions.map((p) => (
              <div key={p.asset_id} className="rounded border border-border-subtle p-widget">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-mono-data text-secondary">{p.tag}</span>
                      <span className={`pill ${BAND_STYLE[p.risk_band]}`}>
                        {Math.round(p.risk_score * 100)}% {p.risk_band} risk
                      </span>
                      {p.existing_work_order && (
                        <span className="pill bg-info-bg text-info-text">
                          {p.existing_work_order} scheduled
                        </span>
                      )}
                    </div>
                    <p className="text-body-lg text-ink mt-1">{p.name}</p>
                    <p className="text-body-sm text-ink-faint">
                      {[p.category, p.room].filter(Boolean).join(' · ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-label-caps uppercase text-ink-muted">Act by</p>
                      <p className="text-body-md text-ink flex items-center gap-1">
                        <CalendarClock size={14} className="text-ink-faint" />
                        {dt(p.recommended_by, 'd MMM yyyy')}
                      </p>
                    </div>
                    <Button
                      size="sm" variant={p.existing_work_order ? 'secondary' : 'primary'}
                      icon={Wrench} disabled={!!p.existing_work_order}
                      loading={raise.isPending && raise.variables === p.asset_id}
                      onClick={() => raise.mutate(p.asset_id)}
                    >
                      {p.existing_work_order ? 'Scheduled' : 'Schedule work'}
                    </Button>
                  </div>
                </div>

                {/* Why */}
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  {p.reasons.map((r) => (
                    <li key={r} className="text-body-md text-ink-muted flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-ink-faint" /> {r}
                    </li>
                  ))}
                </ul>

                {/* Signal breakdown */}
                {p.signals?.components && (
                  <div className="mt-3 pt-3 border-t border-border-subtle grid sm:grid-cols-5 gap-3">
                    {Object.entries(p.signals.components).map(([k, v]) => (
                      <div key={k}>
                        <div className="flex justify-between text-body-sm mb-1">
                          <span className="text-ink-muted">{SIGNAL_LABEL[k] || k}</span>
                          <span className="tabular text-ink">{Math.round(v * 100)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500"
                               style={{
                                 width: `${v * 100}%`,
                                 background: v >= 0.7 ? '#ef4444' : v >= 0.4 ? '#f59e0b' : '#94a3b8',
                               }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Widget>
    </div>
  )
}
