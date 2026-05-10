// Ticketmaster Discovery API v2 — events search.
// Docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/

const apiKey = process.env.TICKETMASTER_CONSUMER_KEY

export interface TicketmasterEvent {
  id: string
  name: string
  url: string  // direct link to event page (we'll wrap with affiliate later)
  dateUtc?: string  // ISO
  dateLocal?: string  // "2026-05-15"
  timeLocal?: string  // "20:00:00"
  venueName?: string
  venueAddress?: string
  venueCity?: string
  imageUrl?: string
  priceMin?: number
  priceMax?: number
  segment?: string  // "Music", "Sports", "Arts & Theatre", "Comedy"
  genre?: string
}

interface RawEvent {
  id: string
  name: string
  url: string
  dates?: {
    start?: { dateTime?: string; localDate?: string; localTime?: string }
  }
  _embedded?: {
    venues?: Array<{
      name?: string
      address?: { line1?: string }
      city?: { name?: string }
    }>
  }
  images?: Array<{ url: string; width: number; height: number; ratio?: string }>
  priceRanges?: Array<{ min: number; max: number; currency: string }>
  classifications?: Array<{ segment?: { name?: string }; genre?: { name?: string } }>
}

interface SearchResponse {
  _embedded?: { events?: RawEvent[] }
  page?: { totalElements: number }
}

const SEGMENT_MAP: Record<string, string> = {
  music: "Music",
  comedy: "Arts & Theatre",
  theater: "Arts & Theatre",
  sports: "Sports",
  movies: "Film",
  festivals: "Music",
  nightlife: "Music",
}

export async function searchTicketmasterEvents(opts: {
  city: string
  keyword?: string
  /** Optional event-type label like "music", "comedy", "sports" */
  classificationName?: string
  /** Days from today to look ahead. Default 30. */
  daysAhead?: number
  size?: number
}): Promise<TicketmasterEvent[]> {
  if (!apiKey) {
    console.warn("TICKETMASTER_CONSUMER_KEY not set; skipping Ticketmaster")
    return []
  }

  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json")
  url.searchParams.set("apikey", apiKey)
  url.searchParams.set("city", opts.city)
  url.searchParams.set("size", String(opts.size ?? 20))
  url.searchParams.set("sort", "date,asc")

  if (opts.keyword) url.searchParams.set("keyword", opts.keyword)

  if (opts.classificationName) {
    const segment = SEGMENT_MAP[opts.classificationName.toLowerCase()] ?? opts.classificationName
    url.searchParams.set("classificationName", segment)
  }

  // Date window
  const now = new Date()
  const end = new Date(now.getTime() + (opts.daysAhead ?? 30) * 86400_000)
  url.searchParams.set("startDateTime", now.toISOString().slice(0, 19) + "Z")
  url.searchParams.set("endDateTime", end.toISOString().slice(0, 19) + "Z")

  const res = await fetch(url.toString(), { cache: "no-store" })
  if (!res.ok) {
    console.error(`Ticketmaster HTTP ${res.status} for ${opts.city} ${opts.keyword ?? ""}`)
    return []
  }

  const data = (await res.json()) as SearchResponse
  const events = data._embedded?.events ?? []

  return events.map((e) => {
    const venue = e._embedded?.venues?.[0]
    // Pick a roughly 16:9 image for cards
    const img = e.images?.find((i) => i.ratio === "16_9" && i.width >= 600) ?? e.images?.[0]
    return {
      id: e.id,
      name: e.name,
      url: e.url,
      dateUtc: e.dates?.start?.dateTime,
      dateLocal: e.dates?.start?.localDate,
      timeLocal: e.dates?.start?.localTime,
      venueName: venue?.name,
      venueAddress: venue?.address?.line1,
      venueCity: venue?.city?.name,
      imageUrl: img?.url,
      priceMin: e.priceRanges?.[0]?.min,
      priceMax: e.priceRanges?.[0]?.max,
      segment: e.classifications?.[0]?.segment?.name,
      genre: e.classifications?.[0]?.genre?.name,
    }
  })
}
