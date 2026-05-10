// Eventbrite events search.
//
// IMPORTANT: Eventbrite deprecated their public events search (`/v3/events/search/`)
// for non-organizer accounts in December 2019. Their API is now mostly for organizers
// managing their own events. This wrapper attempts the call but is expected to often
// return empty results or 401/403; callers should treat it as a best-effort source
// supplementing Ticketmaster, not a primary one.

const apiKey = process.env.EVENTBRITE_API_KEY

export interface EventbriteEvent {
  id: string
  name: string
  url: string
  dateUtc?: string
  venueName?: string
  venueCity?: string
  imageUrl?: string
}

interface RawEvent {
  id: string
  name?: { text?: string }
  url: string
  start?: { utc?: string }
  venue?: { name?: string; address?: { city?: string } }
  logo?: { url?: string }
}

interface SearchResponse {
  events?: RawEvent[]
}

export async function searchEventbriteEvents(opts: {
  city: string
  keyword?: string
  size?: number
}): Promise<EventbriteEvent[]> {
  if (!apiKey) return []

  const url = new URL("https://www.eventbriteapi.com/v3/events/search/")
  url.searchParams.set("location.address", opts.city)
  url.searchParams.set("location.within", "25mi")
  if (opts.keyword) url.searchParams.set("q", opts.keyword)
  url.searchParams.set("expand", "venue")

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    })
    if (!res.ok) {
      // 401/403/404 are the common failure modes; just log and bail.
      console.warn(`Eventbrite ${res.status} (search likely deprecated for this account)`)
      return []
    }
    const data = (await res.json()) as SearchResponse
    return (data.events ?? []).slice(0, opts.size ?? 10).map((e) => ({
      id: e.id,
      name: e.name?.text ?? "Untitled event",
      url: e.url,
      dateUtc: e.start?.utc,
      venueName: e.venue?.name,
      venueCity: e.venue?.address?.city,
      imageUrl: e.logo?.url,
    }))
  } catch (err) {
    console.warn("Eventbrite request failed:", err)
    return []
  }
}
