import { useSearchParams } from 'react-router-dom'

import { useLoginForm } from '@/features/auth/useLoginForm'
import { CenteredCard } from '@/features/auth/variants/CenteredCard'
import { CompactConsole } from '@/features/auth/variants/CompactConsole'
import { SplitBrand } from '@/features/auth/variants/SplitBrand'

/**
 * Sign-in.
 *
 * Three layouts are live at once behind `?v=` so they can be compared against
 * real behaviour rather than screenshots — same form logic, same states, same
 * accessibility, only the arrangement differs. `v=1` is the default because it
 * is the closest evolution of what shipped; once one is chosen the other two
 * come out and this collapses back to a single component.
 */
const VARIANTS = {
  1: SplitBrand,
  2: CenteredCard,
  3: CompactConsole,
}

export default function Login() {
  const [params] = useSearchParams()
  const form = useLoginForm()

  const Variant = VARIANTS[params.get('v')] || SplitBrand
  return <Variant form={form} />
}
