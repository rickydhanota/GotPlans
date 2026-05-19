// Google Places API (New) — Text Search wrapper.
// Server-side only. The API key is NOT exposed to the client.
//
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search

import { cached } from "@/lib/api-cache"

const apiKey = process.env.GOOGLE_PLACES_API_KEY

export interface PlaceOpeningHours {
  /** Periods as returned by the Places API (day = 0-6 where 0=Sunday). */
  periods?: Array<{
    open?: { day: number; hour: number; minute: number }
    close?: { day: number; hour: number; minute: number }
  }>
  weekdayDescriptions?: string[]
}

export interface PlaceCandidate {
  placeId: string
  name: string
  address?: string
  rating?: number
  ratingCount?: number
  /** Normalized 0–4 (where 1=$, 4=$$$$) */
  priceLevel?: number
  types?: string[]
  /** Photo resource name from new API, e.g. "places/X/photos/Y". Use placePhotoUrl() to build a fetch URL. */
  photoName?: string
  /** All available photo resource names (Google returns up to 10). Used for the multi-image carousel. */
  photoNames?: string[]
  openingHours?: PlaceOpeningHours
}

interface RawPlace {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  rating?: number
  userRatingCount?: number
  priceLevel?: string  // enum: PRICE_LEVEL_FREE | _INEXPENSIVE | _MODERATE | _EXPENSIVE | _VERY_EXPENSIVE
  types?: string[]
  photos?: Array<{ name: string }>
  regularOpeningHours?: PlaceOpeningHours
}

interface SearchResponse {
  places?: RawPlace[]
}

const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
}

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.types",
  "places.photos",
  "places.regularOpeningHours",
].join(",")

const CACHE_TTL_SECONDS = 6 * 60 * 60  // 6 hours

export async function placesTextSearch(
  query: string,
  opts: { limit?: number } = {}
): Promise<PlaceCandidate[]> {
  if (!apiKey) {
    console.warn("GOOGLE_PLACES_API_KEY not set; skipping Places search")
    return []
  }

  const limit = Math.min(opts.limit ?? 10, 20)
  const cacheKey = `places:text:${limit}:${query.toLowerCase()}`

  return cached(cacheKey, CACHE_TTL_SECONDS, async () => {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: limit,
      }),
      cache: "no-store",
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => "")
      console.error(`Places search HTTP ${res.status} for "${query}": ${errBody.slice(0, 300)}`)
      return []
    }

    const data = (await res.json()) as SearchResponse
    const places = data.places ?? []

    return places.slice(0, limit).map((r) => {
      const photoNames = r.photos?.map((p) => p.name).slice(0, 10) ?? []
      return {
        placeId: r.id,
        name: r.displayName?.text ?? "Unknown",
        address: r.formattedAddress,
        rating: r.rating,
        ratingCount: r.userRatingCount,
        priceLevel: r.priceLevel ? PRICE_LEVEL_MAP[r.priceLevel] : undefined,
        types: r.types,
        photoName: photoNames[0],  // back-compat: single primary photo
        photoNames,
        openingHours: r.regularOpeningHours,
      }
    })
  })
}

/**
 * Returns true if the place is open at the given local weekday + minute-of-day.
 * If we don't have hours data, returns true (don't filter out venues we can't verify).
 *
 * @param day 0=Sunday … 6=Saturday
 * @param minuteOfDay 0–1439 (e.g. 19:30 → 19*60+30 = 1170)
 */
export function isOpenAt(
  hours: PlaceOpeningHours | undefined,
  day: number,
  minuteOfDay: number
): boolean {
  const periods = hours?.periods
  if (!periods || periods.length === 0) return true  // unknown → don't exclude

  // A "24/7" place is signaled by a single period with open day=0 hour=0 and no close.
  if (periods.length === 1 && periods[0].open && !periods[0].close) return true

  for (const p of periods) {
    if (!p.open) continue
    const openAbs = p.open.day * 1440 + p.open.hour * 60 + (p.open.minute ?? 0)
    // Some periods have no close (open-ended). Treat as open until end of week.
    const closeAbs = p.close
      ? p.close.day * 1440 + p.close.hour * 60 + (p.close.minute ?? 0)
      : openAbs + 24 * 60

    // Close before open ⇒ wraps past midnight; add a week to close.
    const closeNormalized = closeAbs <= openAbs ? closeAbs + 7 * 1440 : closeAbs

    const target = day * 1440 + minuteOfDay
    // Check both the natural week-position and the prior-week wrap.
    if (target >= openAbs && target < closeNormalized) return true
    if (target + 7 * 1440 >= openAbs && target + 7 * 1440 < closeNormalized) return true
  }
  return false
}

/**
 * Parses a slot time string like "7:00 PM", "19:00", "7pm" into minutes-of-day.
 * Returns null on failure.
 */
export function parseSlotTimeToMinutes(time: string): number | null {
  const m = time.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
  if (!m) return null
  let hour = parseInt(m[1], 10)
  const minute = m[2] ? parseInt(m[2], 10) : 0
  const meridiem = m[3]
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null
  if (meridiem === "pm" && hour < 12) hour += 12
  if (meridiem === "am" && hour === 12) hour = 0
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

/**
 * Builds a Google Places Photo URL using the new Places API. Server-side only —
 * sending these to the client would expose the API key. Use a server proxy if you
 * need to display these in the browser.
 */
export function placePhotoUrl(photoName: string, maxWidthPx = 800): string | null {
  if (!apiKey) return null
  // Format: https://places.googleapis.com/v1/{name}/media?key=...&maxWidthPx=...
  const url = new URL(`https://places.googleapis.com/v1/${photoName}/media`)
  url.searchParams.set("key", apiKey)
  url.searchParams.set("maxWidthPx", String(maxWidthPx))
  return url.toString()
}
