import { FileQuestion } from 'lucide-react'
import { ErrorPage } from './ErrorPage'

export default function NotFound() {
  return (
    <ErrorPage
      code="404" icon={FileQuestion} title="Page not found"
      description="The page you're looking for doesn't exist, or it may have been moved."
    />
  )
}
