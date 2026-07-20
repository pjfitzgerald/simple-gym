import { useCallback } from 'react'
import { useCachedGet } from './useCachedGet.js'

// Exercise categories (muscle groups) loaded from the server. Used for the
// filter tabs and the exercise form, replacing the old hardcoded list so
// user-added categories show up everywhere. `addCategory` POSTs a new one
// (the response is the fresh list) and returns the saved (lowercased) name.
export function useCategories() {
  const { data, refresh, mutate } = useCachedGet('/api/categories')
  const categories = data ?? []

  const addCategory = useCallback(async (name) => {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) return null
    mutate(await res.json())
    return name.trim().toLowerCase()
  }, [mutate])

  return { categories, addCategory, refresh }
}
