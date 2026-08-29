import clsx from 'clsx'
import { Building2, GraduationCap, ShieldCheck, UserCog, Wrench } from 'lucide-react'

export const ROLE_TABS = [
  { value: 'student', label: 'Student', icon: GraduationCap },
  { value: 'teacher', label: 'Teacher', icon: UserCog },
  { value: 'technician', label: 'Technician', icon: Wrench },
  { value: 'admin', label: 'Admin', icon: ShieldCheck },
]

export const REGISTER_TABS = [
  { value: 'student', label: 'Student', icon: GraduationCap },
  { value: 'teacher', label: 'Teacher', icon: UserCog },
  { value: 'technician', label: 'Technician', icon: Wrench },
  { value: 'enterprise', label: 'Institution', icon: Building2 },
]

export function RoleTabs({ value, onChange, tabs = ROLE_TABS }) {
  return (
    <div
      role="tablist" aria-label="Account type"
      className="grid gap-1 p-1 bg-brand-soft rounded-lg"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => {
        const active = value === t.value
        return (
          <button
            key={t.value} role="tab" aria-selected={active} type="button"
            onClick={() => onChange(t.value)}
            className={clsx(
              'flex items-center justify-center gap-1.5 h-10 rounded text-body-md font-medium transition-colors px-1',
              active
                ? 'bg-primary text-white shadow-level2'
                : 'text-ink-muted hover:text-ink hover:bg-surface/60',
            )}
          >
            <t.icon size={15} className="shrink-0" />
            <span className="truncate">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
