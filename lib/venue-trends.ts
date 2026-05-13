// Venue-trend tracking. Snapshots Google Places review counts over time so we
// can compute "trending" by review velocity — venues whose review counts are
// growing fastest are the ones gaining real cultural traction right now.
//
// Snapshotting strategy: every time a slot is resolved via Google Places, we
// fire-and-forget a snapshot insert for each venue. Daily uniqueness is enforced
// by a generated `snapshot_day` column + a unique index, so multiple resolves
// in the same UTC day collapse to one row per place.

import { supabaseAdmin } from "@/lib/supabase-admin"
import type { PlaceCandidate } from "@/lib/google-places"

interface SnapshotInput {
  placeId: string
  city: string
  name: string
  rating?: number
  ratingCount?: number
}

/**
 * Records snapshots for a batch of venues. Safe to fire-and-forget — failures
 * are logged but never thrown. Won't block whatever called us.
 */
export async function recordVenueSnapshots(rows: SnapshotInput[]): Promise<void> {
  if (rows.length === 0) return

  // Filter to rows with usable counts (no point snapshotting nulls)
  const payload = rows
    .filter((r) => r.placeId && r.name)
    .map((r) => ({
      place_id: r.placeId,
      city: normalizeCity(r.city),
      name: r.name,
      rating: r.rating ?? null,
      rating_count: r.ratingCount ?? null,
    }))

  if (payload.length === 0) return

  const { error } = await supabaseAdmin
    .from("venue_snapshots")
    .upsert(payload, { onConflict: "place_id,snapshot_day", ignoreDuplicates: true })

  if (error) {
    // Don't propagate — trend tracking is best-effort.
    console.warn("venue_snapshots upsert failed (non-fatal):", error.message)
  }
}

/** Pull-helper: takes Places results from a search and records snapshots. */
export function recordPlaceCandidates(places: PlaceCandidate[], city: string): void {
  // Fire and forget — caller doesn't need to await
  void recordVenueSnapshots(
    places.map((p) => ({
      placeId: p.placeId,
      name: p.name,
      city,
      rating: p.rating,
      ratingCount: p.ratingCount,
    }))
  )
}

// ─── Reading trends ──────────────────────────────────────────────────────────

export interface TrendingVenue {
  placeId: string
  name: string
  rating: number | null
  reviewsNow: number
  reviewsBefore: number | null
  growth: number  // absolute review count delta
  growthRate: number | null  // 0–1 fractional growth; null when no prior snapshot
}

interface SnapshotRow {
  place_id: string
  name: string
  rating: number | null
  rating_count: number | null
  snapshot_at: string
}

/**
 * Returns the top-N venues in a city by review-count growth over the last
 * `lookbackDays` days. Requires at least two snapshots per venue (one inside
 * the lookback window, one before it). Until we accumulate enough data, this
 * will return a short list.
 */
export async function getTrendingVenues(
  city: string,
  opts: { lookbackDays?: number; limit?: number } = {}
): Promise<TrendingVenue[]> {
  const lookbackDays = opts.lookbackDays ?? 30
  const limit = opts.limit ?? 10
  const cityKey = normalizeCity(city)

  // Pull every snapshot for the city over the last 2x lookback window.
  // 2x gives us a "before" sample for the velocity calculation.
  const since = new Date(Date.now() - lookbackDays * 2 * 86400_000).toISOString()

  const { data, error } = await supabaseAdmin
    .from("venue_snapshots")
    .select("place_id, name, rating, rating_count, snapshot_at")
    .eq("city", cityKey)
    .gte("snapshot_at", since)
    .order("snapshot_at", { ascending: true })

  if (error || !data) {
    console.warn("getTrendingVenues query failed:", error?.message)
    return []
  }

  const rows = data as SnapshotRow[]
  const cutoffMs = Date.now() - lookbackDays * 86400_000

  // Group snapshots per place
  const byPlace = new Map<string, SnapshotRow[]>()
  for (const r of rows) {
    if (!r.rating_count) continue
    if (!byPlace.has(r.place_id)) byPlace.set(r.place_id, [])
    byPlace.get(r.place_id)!.push(r)
  }

  const venues: TrendingVenue[] = []
  for (const [placeId, snaps] of byPlace) {
    // snaps is sorted ascending by snapshot_at
    const latest = snaps[snaps.length - 1]
    if (!latest.rating_count) continue

    // Earliest snapshot from BEFORE the lookback window
    const beforeWindow = snaps
      .filter((s) => new Date(s.snapshot_at).getTime() < cutoffMs)
      .pop()  // most recent one that's still before the window

    const reviewsNow = latest.rating_count
    const reviewsBefore = beforeWindow?.rating_count ?? null
    const growth = reviewsBefore != null ? reviewsNow - reviewsBefore : reviewsNow
    const growthRate =
      reviewsBefore != null && reviewsBefore > 0 ? growth / reviewsBefore : null

    venues.push({
      placeId,
      name: latest.name,
      rating: latest.rating,
      reviewsNow,
      reviewsBefore,
      growth,
      growthRate,
    })
  }

  // Rank: prefer venues with high absolute growth AND a meaningful rate.
  // We dampen by review base so a place going 10→20 doesn't beat 500→700.
  venues.sort((a, b) => b.growth - a.growth)

  return venues.slice(0, limit)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeCity(s: string): string {
  return s.toLowerCase().trim().replace(/\s*,.*$/, "")  // "San Jose, CA" -> "san jose"
}
