import { useState, useEffect, useCallback } from 'react'

// The tab panes remount on every tab switch, and each used to slide in empty
// and "snap" once its mount fetch resolved. This module keeps the last JSON
// per URL so a remounting pane renders instantly from the cache (possibly
// stale) while a background refetch revalidates — the WorkoutHistory
// sessionsCache pattern, generalised. In-flight requests are shared per URL,
// so the app-boot prefetch and a pane mounting a moment later cost one
// request, not two.

const dataCache = new Map() // url -> last JSON payload
const inflight = new Map() // url -> pending fetch promise

function fetchFresh(url) {
  if (inflight.has(url)) return inflight.get(url)
  const p = fetch(url)
    .then(r => {
      if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`)
      return r.json()
    })
    .then(data => {
      dataCache.set(url, data)
      return data
    })
    .finally(() => inflight.delete(url))
  inflight.set(url, p)
  return p
}

// Warm the cache outside any component (app boot). Errors are swallowed —
// the owning pane's mount fetch will retry and surface its own failure.
export function prefetch(urls) {
  urls.forEach(url => fetchFresh(url).catch(() => {}))
}

// `data` is undefined until the first response for this URL ever lands, so
// gate empty-state messages on it to keep them from flashing mid-load.
export function useCachedGet(url) {
  const [data, setData] = useState(() => dataCache.get(url))

  useEffect(() => {
    let live = true
    fetchFresh(url)
      .then(d => { if (live) setData(d) })
      .catch(() => {})
    return () => { live = false }
  }, [url])

  const refresh = useCallback(async () => {
    const d = await fetchFresh(url)
    setData(d)
    return d
  }, [url])

  // Optimistic local update: write straight to cache + state (other mounted
  // readers of the same URL catch up on their next mount/refresh).
  const mutate = useCallback(next => {
    dataCache.set(url, next)
    setData(next)
  }, [url])

  return { data, refresh, mutate }
}
