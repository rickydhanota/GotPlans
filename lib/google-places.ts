// Google Places API (New) — Text Search wrapper.
// Server-side only. The API key is NOT exposed to the client.
//
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search

const apiKey = process.env.GOOGLE_PLACES_API_KEY

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
].join(",")

export async function placesTextSearch(
  query: string,
  opts: { limit?: number } = {}
): Promise<PlaceCandidate[]> {
  if (!apiKey) {
    console.warn("GOOGLE_PLACES_API_KEY not set; skipping Places search")
    return []
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: Math.min(opts.limit ?? 10, 20),
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

  return places.slice(0, opts.limit ?? 10).map((r) => ({
    placeId: r.id,
    name: r.displayName?.text ?? "Unknown",
    address: r.formattedAddress,
    rating: r.rating,
    ratingCount: r.userRatingCount,
    priceLevel: r.priceLevel ? PRICE_LEVEL_MAP[r.priceLevel] : undefined,
    types: r.types,
    photoName: r.photos?.[0]?.name,
  }))
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
