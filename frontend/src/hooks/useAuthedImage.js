import { useEffect, useState } from 'react'
import { fetchAuthedBlob } from '../lib/api'

/**
 * Resolve a private /uploads/file/... path (evidence photo, avatar, Lost &
 * Found image) to a displayable src, fetching it with the caller's bearer
 * token and handing back a local blob: URL — a plain <img src> cannot carry
 * that header, and the route requires it (see backend/app/api/v1/uploads.py).
 *
 * Revokes its own object URL on unmount / path change, so callers can treat
 * the return value like any other src without leaking blob URLs.
 */
export function useAuthedImage(path) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    if (!path) {
      setSrc(null)
      return
    }

    let cancelled = false
    let objectUrl = null

    fetchAuthedBlob(path)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        objectUrl = url
        setSrc(url)
      })
      .catch(() => {
        if (!cancelled) setSrc(null)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path])

  return src
}
