import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button, confirmDialog, toast } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

/**
 * Admin-only "delete this record" control for a detail page.
 *
 * The server removes the record together with everything that exists only
 * because of it and replies with a sentence naming what went along, so the
 * toast is the receipt. The detail query is dropped from the cache before
 * navigating away, otherwise the page would refetch the deleted record and
 * flash a 404.
 */
export default function AdminDeleteButton({ path, queryKey, backTo, noun, warning, className }) {
  const isAdmin = useAuth((s) => s.isAdmin())
  const navigate = useNavigate()
  const qc = useQueryClient()

  const remove = useMutation({
    mutationFn: () => api.del(path),
    onSuccess: (d) => {
      qc.removeQueries({ queryKey })
      qc.invalidateQueries()
      toast.success(d.detail)
      navigate(backTo, { replace: true })
    },
    onError: (e) => toast.error(e.detail || `Could not delete this ${noun}`),
  })

  if (!isAdmin) return null

  const onClick = async () => {
    const ok = await confirmDialog(
      `Delete this ${noun}? ${warning} This cannot be undone.`,
      { danger: true, confirmLabel: 'Delete' },
    )
    if (ok) remove.mutate()
  }

  return (
    <Button
      size="sm" variant="ghost" icon={Trash2} className={className}
      loading={remove.isPending} onClick={onClick}
    >
      Delete
    </Button>
  )
}
