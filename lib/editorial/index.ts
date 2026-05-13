// Editorial source registry. Right now we only have Eater; this is the seam
// for adding Infatuation, NYT Critic's Picks, etc.

import { supabaseAdmin } from "@/lib/supabase-admin"
import { fetchEaterPicks, type EditorialPick } from "./eater"

export type EditorialSource = "eater"

export interface EditorialCachedResult {
  source: EditorialSource
  city: string
  picks: EditorialPick[]
  fetchedAt: string  // ISO
  /** True when we served from the DB cache, false when fresh. */
  fromCache: boolean
}

const CACHE_TTL_HOURS = 24

interface CacheRow {
  source: string
  city: string
  payload: { picks: EditorialPick[] }
  fetched_at: string
}

/**
 * Returns editorial picks for a city, cached in Supabase for 24h. Returns
 * `null` if no source publishes for this city.
 */
export async function getEditorialPicks(
  source: EditorialSource,
  city: string
): Promise<EditorialCachedResult | null> {
  const cityKey = normalizeCity(city)
  if (!cityKey) return null

  // 1) Try cache first
  const { data: cached } = await supabaseAdmin
    .from("editorial_cache")
    .select("source, city, payload, fetched_at")
    .eq("source", source)
    .eq("city", cityKey)
    .single()

  if (cached) {
    const row = cached as CacheRow
    const ageMs = Date.now() - new Date(row.fetched_at).getTime()
    if (ageMs < CACHE_TTL_HOURS * 3600_000) {
      return {
        source,
        city: cityKey,
        picks: row.payload.picks ?? [],
        fetchedAt: row.fetched_at,
        fromCache: true,
      }
    }
  }

  // 2) Fetch fresh
  let picks: EditorialPick[] | null = null
  if (source === "eater") {
    picks = await fetchEaterPicks(city)
  }

  if (picks === null) {
    // Source doesn't cover this city
    return null
  }

  // 3) Upsert cache
  const fetchedAt = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from("editorial_cache")
    .upsert(
      { source, city: cityKey, payload: { picks }, fetched_at: fetchedAt },
      { onConflict: "source,city" }
    )
  if (error) {
    console.warn("editorial_cache upsert failed:", error.message)
  }

  return { source, city: cityKey, picks, fetchedAt, fromCache: false }
}

function normalizeCity(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s*,.*$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
}
