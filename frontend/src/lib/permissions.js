import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

/**
 * The signed-in user's permission codes (from Admin → Roles → Manage).
 * `perms` is undefined until loaded. Refetched on window focus and every
 * minute, so a change made in Roles reaches already-open sessions.
 */
export function usePermissions() {
  const user = useAuth((s) => s.user)
  const q = useQuery({
    queryKey: ['my-permissions', user?.id, user?.role],
    queryFn: () => api.get('/auth/me/permissions'),
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  return { perms: q.data?.permissions, loading: !!user && q.isLoading, error: q.error }
}
