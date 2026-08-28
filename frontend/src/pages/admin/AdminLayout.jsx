import clsx from 'clsx'
import { NavLink, Outlet } from 'react-router-dom'

import { ADMIN_NAV } from '@/layouts/nav'

export default function AdminLayout() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-headline-lg text-ink">Administration</h1>
        <p className="text-body-md text-ink-muted mt-1">
          Users, access control, campus configuration and platform health.
        </p>
      </header>

      {/* Horizontal sub-nav; the module rail is already the primary sidebar. */}
      <nav className="border-b border-border-subtle overflow-x-auto no-print">
        <div className="flex gap-1 min-w-max">
          {ADMIN_NAV.map((item) => (
            <NavLink
              key={item.to} to={item.to} end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2 h-10 px-3 text-body-md font-medium whitespace-nowrap',
                  'border-b-2 -mb-px transition-colors',
                  isActive
                    ? 'border-secondary text-secondary'
                    : 'border-transparent text-ink-muted hover:text-ink',
                )
              }
            >
              <item.icon size={16} /> {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <Outlet />
    </div>
  )
}
