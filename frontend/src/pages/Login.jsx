import { Link } from 'react-router-dom'

import { AuthShell } from '@/features/auth/AuthShell'
import {
  EmailField, ErrorSummary, ExpiredNotice, FormMeta, PasswordField, SubmitButton,
} from '@/features/auth/LoginParts'
import { RoleTabs } from '@/features/auth/RoleTabs'
import { useLoginForm } from '@/features/auth/useLoginForm'

export default function Login() {
  const {
    role, setRole, email, setEmail, password, setPassword,
    remember, setRemember, errors, errorList, submitting, succeeded, expired,
    submit, summaryRef, fieldRefs,
  } = useLoginForm()

  return (
    <AuthShell
      title="Sign in"
      subtitle="Use the account your campus issued you."
      footer={
        <>
          New to Campus Netra?{' '}
          <Link to="/register" className="text-secondary font-medium hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <RoleTabs value={role} onChange={setRole} />
        {expired && <ExpiredNotice />}
        <ErrorSummary {...{ errors, errorList, summaryRef, fieldRefs }} />

        <EmailField
          value={email} onChange={setEmail}
          error={errors.email} inputRef={fieldRefs.email}
        />
        <PasswordField
          value={password} onChange={setPassword}
          error={errors.password} inputRef={fieldRefs.password}
        />
        <FormMeta remember={remember} onRemember={setRemember} />
        <SubmitButton submitting={submitting} succeeded={succeeded} />
      </form>
    </AuthShell>
  )
}
