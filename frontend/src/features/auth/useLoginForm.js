import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { toast } from '@/components/ui'
import { ROLE_HOME, useAuth } from '@/lib/auth'

import { useCaptcha } from './useCaptcha'

/**
 * Everything the sign-in form does, minus how it looks.
 *
 * Extracted so the layout variants share one implementation: three copies of
 * validation and submit handling would drift, and the differences between them
 * are meant to be visual, not behavioural. The authentication call itself is
 * unchanged — this only adds the states the UI needs to report.
 *
 * `status` is a small machine rather than a pair of booleans: idle → submitting
 * → succeeded | failed. A button cannot then be both loading and showing an
 * error, and the success state survives long enough to be seen before the route
 * changes.
 */
export function useLoginForm() {
  const [role, setRole] = useState('student')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle')
  // Real state, so the checkbox stops being a control that does nothing. It is
  // deliberately not passed to login() — session lifetime is auth's business,
  // and this change is scoped to the interface.
  const [remember, setRemember] = useState(false)

  const summaryRef = useRef(null)
  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const captchaRef = useRef(null)

  const captcha = useCaptcha()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const expired = params.get('expired')

  const fieldRefs = { email: emailRef, password: passwordRef, captcha: captchaRef }

  const submit = async (e) => {
    e.preventDefault()
    setErrors({})

    const next = {}
    if (!email.trim()) next.email = 'Enter your email address'
    if (!password) next.password = 'Enter your password'
    if (!captcha.answer.trim()) next.captcha = 'Enter the characters shown'
    if (Object.keys(next).length) {
      setErrors(next)
      setStatus('failed')
      // Focus the summary rather than the first bad field: it names every
      // problem at once, and the field links let someone jump to whichever
      // they want to fix first.
      requestAnimationFrame(() => summaryRef.current?.focus())
      return
    }

    setStatus('submitting')
    try {
      // The admin tab covers both admin and facility_manager accounts, so it
      // authenticates without a role constraint and routes on the result.
      const user = await login(email.trim(), password, role === 'admin' ? null : role, captcha)
      setStatus('succeeded')
      toast.success(`Welcome back, ${user.full_name.split(' ')[0]}.`)
      navigate(ROLE_HOME[user.role] || '/dashboard', { replace: true })
    } catch (err) {
      setStatus('failed')
      const fields = err.fields
      if (fields) {
        // The server validates the challenge as two separate inputs; the form
        // shows one, so either complaint lands on it.
        const captchaProblem = fields.captcha_answer || fields.captcha_token
        setErrors({ ...fields, ...(captchaProblem ? { captcha: captchaProblem } : {}) })
      } else {
        setErrors({ _: err.detail || 'Unable to sign in. Please try again.' })
      }
      // A refused attempt gets a new puzzle rather than the one just rejected.
      captcha.refresh()
      requestAnimationFrame(() => summaryRef.current?.focus())
    }
  }

  /** Field errors in form order, for the summary's jump links. */
  const errorList = ['email', 'password', 'captcha']
    .filter((k) => errors[k])
    .map((k) => ({ field: k, message: errors[k] }))

  return {
    role, setRole,
    remember, setRemember,
    email, setEmail,
    password, setPassword,
    errors, errorList,
    captcha,
    status,
    submitting: status === 'submitting',
    succeeded: status === 'succeeded',
    expired,
    submit,
    summaryRef, fieldRefs,
  }
}
