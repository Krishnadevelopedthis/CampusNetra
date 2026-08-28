import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui'

export function ErrorPage({ code, title, description, icon: Icon, action }) {
  return (
    <div className="min-h-screen bg-surface-base flex flex-col items-center justify-center p-6 text-center">
      <div className="mb-10"><Logo subtitle={null} /></div>

      {Icon && (
        <div className="w-14 h-14 rounded-lg bg-surface border border-border-subtle grid place-items-center mb-6">
          <Icon size={26} className="text-ink-faint" />
        </div>
      )}

      <p className="text-display-metrics text-primary tabular">{code}</p>
      <h1 className="text-headline-lg text-ink mt-2">{title}</h1>
      <p className="text-body-lg text-ink-muted mt-2 max-w-md">{description}</p>

      <div className="mt-8 flex flex-wrap gap-3 justify-center">
        {action}
        <Link to="/dashboard" className="btn-primary">Back to dashboard</Link>
      </div>
    </div>
  )
}
