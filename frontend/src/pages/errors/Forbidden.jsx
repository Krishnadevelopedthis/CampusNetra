import { ShieldAlert } from 'lucide-react'
import { ErrorPage } from './ErrorPage'

export default function Forbidden() {
  return (
    <ErrorPage
      code="403" icon={ShieldAlert} title="You don't have access"
      description="Your role doesn't permit this area. Contact your campus administrator if you believe this is a mistake."
    />
  )
}
