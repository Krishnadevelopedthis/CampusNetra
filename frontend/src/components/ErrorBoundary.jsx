import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Component } from 'react'

/**
 * Catches render-time crashes.
 *
 * Without one of these React unmounts the whole tree, and the user is left
 * looking at a blank white page with the actual error only in the console.
 * `resetKey` — the current pathname, in practice — clears the error on
 * navigation, so one broken page does not wedge the rest of the app.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // The stack is for us, in the console; the screen gets a sentence.
    console.error('Render error:', error, info?.componentStack)
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-[60vh] grid place-items-center p-6">
        <div className="text-center max-w-md">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-danger-bg grid place-items-center mb-5">
            <AlertTriangle size={26} className="text-danger" />
          </div>
          <h1 className="text-headline-lg text-ink">This page didn’t load</h1>
          <p className="text-body-md text-ink-muted mt-2">
            Something went wrong while displaying it. Your data is safe — nothing
            was lost.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            <button onClick={() => this.setState({ error: null })} className="btn-secondary">
              <RefreshCw size={16} /> Try again
            </button>
            <button onClick={() => window.location.assign('/dashboard')} className="btn-primary">
              Back to dashboard
            </button>
          </div>
          <p className="text-body-sm text-ink-faint mt-6">
            If this keeps happening, contact support at{' '}
            <a href="mailto:techcareit.in@gmail.com" className="text-secondary hover:underline">
              techcareit.in@gmail.com
            </a>
            .
          </p>
        </div>
      </div>
    )
  }
}
