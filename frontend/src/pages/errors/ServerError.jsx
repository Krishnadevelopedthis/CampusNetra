import { ServerCrash } from 'lucide-react'
import { ErrorPage } from './ErrorPage'
import { Button } from '@/components/ui'

export default function ServerError() {
  return (
    <ErrorPage
      code="500" icon={ServerCrash} title="Something went wrong on our end"
      description="The system hit an unexpected error. The team has been notified — please try again shortly."
      action={<Button variant="secondary" onClick={() => location.reload()}>Try again</Button>}
    />
  )
}
