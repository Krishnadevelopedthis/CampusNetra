import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { toast } from '@/components/ui'
import { api } from '@/lib/api'

/**
 * Delete a place, offering to take its contents when the API refuses.
 *
 * The refusal is the right default — dropping a block should not silently take
 * a hundred assets with it — but it used to be the only option, so emptying a
 * building meant deleting every asset, then every room, then every floor by
 * hand. The 409 names what is inside, so that becomes one informed question.
 */
export function useCascadingDelete({ path, onDone }) {
  const [pendingId, setPendingId] = useState(null)

  const run = useMutation({
    mutationFn: ({ id, cascade }) =>
      api.del(`${path}/${id}`, { params: cascade ? { cascade: 1 } : undefined }),
    onMutate: ({ id }) => setPendingId(id),
    onSuccess: (d) => { toast.success(d.detail); onDone?.() },
    onSettled: () => setPendingId(null),
  })

  const remove = (id, label) => {
    if (!confirm(`Delete ${label}?`)) return
    run.mutate({ id, cascade: false }, {
      onError: (err) => {
        if (err.status !== 409) return toast.error(err.detail || 'Could not delete that')
        if (confirm(`${err.detail}\n\nDelete it and everything inside? This cannot be undone.`)) {
          run.mutate({ id, cascade: true },
                     { onError: (e) => toast.error(e.detail || 'Could not delete that') })
        }
      },
    })
  }

  return { remove, pendingId }
}
