import { useCallback, useEffect, useState } from 'react'

import { api } from '@/lib/api'

/**
 * The image challenge the sign-in and reset forms have to pass.
 *
 * The picture and its token arrive together and the answer is only ever
 * checked on the server, so nothing here is secret. A fresh challenge is
 * fetched after every rejected attempt: the server would still accept the
 * previous token until it expires, but leaving the same puzzle on screen
 * after a refusal reads as the form having ignored what was typed.
 *
 * A challenge that fails to load is not fatal. The field shows a retry and
 * the form still submits — it is the server's job to refuse, and a captcha
 * that cannot load must not be the reason nobody can sign in.
 */
export function useCaptcha() {
  const [challenge, setChallenge] = useState(null)
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    setAnswer('')
    try {
      setChallenge(await api.get('/auth/captcha'))
    } catch {
      setChallenge(null)
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return {
    token: challenge?.captcha_token || '',
    image: challenge?.image || null,
    answer,
    setAnswer,
    loading,
    failed,
    refresh,
  }
}
