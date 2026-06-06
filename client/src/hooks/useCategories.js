import { useState, useEffect, useCallback } from 'react'

// Exercise categories (muscle groups) loaded from the server. Used for the
// filter tabs and the exercise form, replacing the old hardcoded list so
// user-added categories show up everywhere. `addCategory` POSTs a new one and
// refreshes the list, returning the saved (lowercased) name.
export function useCategories() {
  const [categories, setCategories] = useState([])

  const refresh = useCallback(() => {
    return fetch('/api/categories')
      .then(r => r.json())
      .then(setCategories)
      .catch(() => {})
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const addCategory = useCallback(async (name) => {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) return null
    const list = await res.json()
    setCategories(list)
    return name.trim().toLowerCase()
  }, [])

  return { categories, addCategory, refresh }
}
