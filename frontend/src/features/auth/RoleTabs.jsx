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
    // Wrapping rather than a fixed column count: these tabs sit in a 420px
    // form column in one layout and a 380px card in another, so an equal split
    // clipped "Technician" to "Technic…". A viewport breakpoint cannot see that
    // — the card is narrow inside a wide window — but a min width per tab lets
    // them fall to a second row exactly when they no longer fit.
    <div
      role="tablist" aria-label="Account type"
      className="flex flex-wrap gap-1 p-1 bg-brand-soft rounded-lg"
    >
      {tabs.map((t) => {
        const active = value === t.value
        return (
          <button
            key={t.value} role="tab" aria-selected={active} type="button"
            onClick={() => onChange(t.value)}
            className={clsx(
              'flex flex-1 basis-[108px] items-center justify-center gap-1.5 min-h-11 px-2',
              'rounded text-body-md font-medium transition-colors',
              active
                ? 'bg-primary text-white shadow-level2'
                : 'text-ink-muted hover:text-ink hover:bg-surface/60',
            )}
          >
            <t.icon size={15} className="shrink-0" aria-hidden="true" />
            <span>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
