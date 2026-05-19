// Tiny in-memory TTL cache for outbound API responses.
// Lives only for the lifetime of the server process — fine for dev and for
// reducing duplicate calls within a generate/regenerate burst on the same
// instance. For multi-instance prod, swap to Supabase or Redis.

interface Entry<T> {
  value: T
  expiresAt: number
}

const store = new Map<string, Entry<unknown>>()
const MAX_ENTRIES = 500

export function cacheGet<T>(key: string): T | null {
  const e = store.get(key) as Entry<T> | undefined
  if (!e) return null
  if (e.expiresAt < Date.now()) {
    store.delete(key)
    return null
  }
  return e.value
}

export function cacheSet<T>(key: string, value: T, ttlSeconds: number): void {
  // Crude bound: drop the oldest insertion if we hit the cap.
  if (store.size >= MAX_ENTRIES) {
    const oldestKey = store.keys().next().value
    if (oldestKey !== undefined) store.delete(oldestKey)
  }
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
}

/** Returns the cached value if present, otherwise runs `fn`, caches, and returns. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const hit = cacheGet<T>(key)
  if (hit !== null) return hit
  const value = await fn()
  cacheSet(key, value, ttlSeconds)
  return value
}
