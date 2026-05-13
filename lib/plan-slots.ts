import { placesTextSearch, type PlaceCandidate } from "@/lib/google-places"
import {
  searchTicketmasterEvents,
  type TicketmasterEvent,
} from "@/lib/ticketmaster"
import {
  searchEventbriteEvents,
  type EventbriteEvent,
} from "@/lib/eventbrite"
import { googleMapsLink, openTableLink, ticketmasterLink } from "@/lib/affiliate"
import { recordPlaceCandidates } from "@/lib/venue-trends"

// ─── Types ────────────────────────────────────────────────────────────────────

export type SlotType = "restaurant" | "drinks" | "event" | "activity"

export interface SlotBrief {
  type: SlotType
  time: string
  duration: string
  intent: string
  /** Search keyword used for Google Places / Ticketmaster lookups. */
  keyword: string
  /** Event genre for Ticketmaster classification. Only meaningful when type=event. */
  eventGenre?: string
}

export interface PlanOption {
  source: "google_places" | "ticketmaster" | "eventbrite"
  name: string
  address?: string
  city?: string
  rating?: number
  ratingCount?: number
  priceLevel?: number
  estimatedCost?: number
  imageUrl?: string
  externalUrl?: string
  externalId?: string
  eventDate?: string
  actions: {
    primary?: { label: string; href: string }
    directions?: string
  }
}

export interface PlanSlot {
  type: SlotType
  time: string
  duration: string
  intent: string
  /** Saved on the slot so we can re-search later for the "Show different options" feature. */
  keyword: string
  eventGenre?: string
  options: PlanOption[]
  /**
   * IDs of every option ever shown for this slot (current + previous refreshes).
   * Used to exclude already-seen results when refreshing.
   */
  seenIds: string[]
  /** Index of the user's locked-in pick within `options`, or null if not locked. */
  lockedIdx: number | null
}

// ─── Adapters: source → option ────────────────────────────────────────────────

function priceLevelToCost(level: number | undefined): number {
  if (level == null) return 40
  return [15, 25, 50, 90, 150][level] ?? 40
}

export function placeToOption(p: PlaceCandidate, city: string): PlanOption {
  return {
    source: "google_places",
    name: p.name,
    address: p.address,
    rating: p.rating,
    ratingCount: p.ratingCount,
    priceLevel: p.priceLevel,
    estimatedCost: priceLevelToCost(p.priceLevel),
    // Route photos through our proxy so the API key isn't exposed to the browser
    imageUrl: p.photoName
      ? `/api/places/photo?name=${encodeURIComponent(p.photoName)}&w=800`
      : undefined,
    externalId: p.placeId,
    actions: {
      primary: { label: "Reserve", href: openTableLink(p.name, city) },
      directions: googleMapsLink(`${p.name} ${p.address ?? city}`),
    },
  }
}

export function ticketmasterToOption(e: TicketmasterEvent): PlanOption {
  const cost = e.priceMin ?? e.priceMax ?? 30
  return {
    source: "ticketmaster",
    name: e.name,
    address: [e.venueName, e.venueAddress].filter(Boolean).join(", ") || undefined,
    city: e.venueCity,
    estimatedCost: cost,
    imageUrl: e.imageUrl,
    externalUrl: e.url,
    externalId: e.id,
    eventDate: e.dateUtc ?? e.dateLocal,
    actions: {
      primary: { label: "Get tickets", href: ticketmasterLink(e.url) },
      directions: e.venueName
        ? googleMapsLink(`${e.venueName} ${e.venueCity ?? ""}`)
        : undefined,
    },
  }
}

export function eventbriteToOption(e: EventbriteEvent): PlanOption {
  return {
    source: "eventbrite",
    name: e.name,
    city: e.venueCity,
    estimatedCost: 25,
    imageUrl: e.imageUrl,
    externalUrl: e.url,
    externalId: e.id,
    eventDate: e.dateUtc,
    actions: {
      primary: { label: "Get tickets", href: e.url },
      directions: e.venueName
        ? googleMapsLink(`${e.venueName} ${e.venueCity ?? ""}`)
        : undefined,
    },
  }
}

// ─── The main resolver ────────────────────────────────────────────────────────

/**
 * Run the search for a slot brief and return the top 3 fresh options that
 * haven't been shown before (according to `excludeIds`).
 *
 * For a fresh slot, pass `excludeIds = []`.
 * For a "show different options" refresh, pass the slot's existing `seenIds`.
 */
export async function resolveSlotOptions(
  brief: SlotBrief,
  city: string,
  excludeIds: string[] = []
): Promise<{ options: PlanOption[]; freshIds: string[] }> {
  const exclude = new Set(excludeIds)
  let candidates: PlanOption[] = []

  if (
    brief.type === "restaurant" ||
    brief.type === "drinks" ||
    brief.type === "activity"
  ) {
    const query =
      brief.type === "restaurant"
        ? `${brief.keyword} restaurant in ${city}`
        : brief.type === "drinks"
        ? `${brief.keyword} bar in ${city}`
        : `${brief.keyword} in ${city}`

    // Pull up to 20 — we need headroom so that even after multiple refreshes there are fresh ones.
    const places = await placesTextSearch(query, { limit: 20 })
    // Fire-and-forget: track venue review counts over time so we can compute trends later.
    recordPlaceCandidates(places, city)
    candidates = places
      .filter((p) => (p.rating ?? 0) >= 4.0)
      .sort((a, b) => (b.ratingCount ?? 0) - (a.ratingCount ?? 0))
      .map((p) => placeToOption(p, city))
  } else if (brief.type === "event") {
    const [tm, eb] = await Promise.all([
      searchTicketmasterEvents({
        city,
        keyword: brief.keyword,
        classificationName: brief.eventGenre,
        size: 20,
      }),
      searchEventbriteEvents({ city, keyword: brief.keyword, size: 10 }),
    ])
    candidates = [
      ...tm.map(ticketmasterToOption),
      ...eb.map(eventbriteToOption),
    ]
  }

  // Filter out any we've already shown
  const fresh = candidates.filter(
    (c) => c.externalId && !exclude.has(c.externalId)
  )
  const top = fresh.slice(0, 3)
  const freshIds = top
    .map((o) => o.externalId)
    .filter((id): id is string => Boolean(id))

  return { options: top, freshIds }
}
