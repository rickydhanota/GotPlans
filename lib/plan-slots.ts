import {
  placesTextSearch,
  isOpenAt,
  parseSlotTimeToMinutes,
  type PlaceCandidate,
} from "@/lib/google-places"
import {
  searchTicketmasterEvents,
  type TicketmasterEvent,
} from "@/lib/ticketmaster"
import type { EventbriteEvent } from "@/lib/eventbrite"
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
  /**
   * Plan-wide neighborhood anchor (e.g. "Mission District"). Scoped to the city.
   * Used to keep all slots geographically close so users aren't traveling far
   * between stops in larger cities.
   */
  neighborhood?: string
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
  /** Primary image — kept for back-compat. Equivalent to imageUrls[0]. */
  imageUrl?: string
  /** All available images for the carousel. Google Places typically returns 5-10 per venue. */
  imageUrls?: string[]
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
  /** Neighborhood the plan is anchored to (for refresh searches). */
  neighborhood?: string
  options: PlanOption[]
  /**
   * IDs of every option ever shown for this slot (current + previous refreshes).
   * Used to exclude already-seen results when refreshing.
   */
  seenIds: string[]
  /**
   * Indices of all locked-in picks within `options`. Locked options are
   * preserved across "Show different options" refreshes.
   */
  lockedIdxs?: number[]
  /**
   * @deprecated Use `lockedIdxs` instead. Retained so plans saved before
   * multi-lock landed still render and behave correctly. Read via
   * {@link getLockedIdxSet}.
   */
  lockedIdx?: number | null
}

/**
 * Reads a slot's locked set, transparently handling both the new
 * `lockedIdxs[]` field and the legacy single `lockedIdx`. Always returns a
 * fresh Set — safe to mutate.
 */
export function getLockedIdxSet(slot: Pick<PlanSlot, "lockedIdxs" | "lockedIdx">): Set<number> {
  if (slot.lockedIdxs && slot.lockedIdxs.length > 0) return new Set(slot.lockedIdxs)
  if (slot.lockedIdx != null) return new Set([slot.lockedIdx])
  return new Set()
}

// ─── Adapters: source → option ────────────────────────────────────────────────

function priceLevelToCost(level: number | undefined): number {
  if (level == null) return 40
  return [15, 25, 50, 90, 150][level] ?? 40
}

export function placeToOption(p: PlaceCandidate, city: string): PlanOption {
  // Route every photo through our proxy so the API key isn't exposed to the browser
  const imageUrls = (p.photoNames ?? (p.photoName ? [p.photoName] : []))
    .map((name) => `/api/places/photo?name=${encodeURIComponent(name)}&w=800`)

  return {
    source: "google_places",
    name: p.name,
    address: p.address,
    rating: p.rating,
    ratingCount: p.ratingCount,
    priceLevel: p.priceLevel,
    estimatedCost: priceLevelToCost(p.priceLevel),
    imageUrl: imageUrls[0],
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
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
    imageUrls: e.imageUrl ? [e.imageUrl] : undefined,
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
    imageUrls: e.imageUrl ? [e.imageUrl] : undefined,
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

export interface ResolveSlotOpts {
  /**
   * Plan date as YYYY-MM-DD. Used for two things:
   *  - narrowing Ticketmaster results to that exact day
   *  - picking the weekday to check Place opening hours against
   * When omitted, today is used for the open-now check and TM falls back to a
   * 7-day window.
   */
  targetDate?: string
}

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
  excludeIds: string[] = [],
  opts: ResolveSlotOpts = {}
): Promise<{ options: PlanOption[]; freshIds: string[] }> {
  const exclude = new Set(excludeIds)

  // First attempt with the brief's keyword.
  const candidates = await runSearch(brief, city, brief.keyword, opts)

  // Fallback retry — if nothing matched (or only excluded results), broaden
  // the query by dropping the specific keyword and falling back to the slot
  // type's generic term. Better to surface a generic option than to silently
  // drop the slot from the plan.
  const haveFresh = candidates.some(
    (c) => c.externalId && !exclude.has(c.externalId)
  )
  if (!haveFresh) {
    const fallbackKeyword = fallbackKeywordFor(brief.type)
    if (fallbackKeyword && fallbackKeyword !== brief.keyword.toLowerCase()) {
      const retry = await runSearch(brief, city, fallbackKeyword, opts)
      // Merge: prefer original-keyword results when both have hits.
      const seen = new Set(candidates.map((c) => c.externalId))
      for (const r of retry) {
        if (r.externalId && !seen.has(r.externalId)) candidates.push(r)
      }
    }
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

async function runSearch(
  brief: SlotBrief,
  city: string,
  keyword: string,
  opts: ResolveSlotOpts
): Promise<PlanOption[]> {
  if (
    brief.type === "restaurant" ||
    brief.type === "drinks" ||
    brief.type === "activity"
  ) {
    // If we have a neighborhood anchor, scope the search to it so the entire
    // plan stays geographically tight. Otherwise just the city.
    const locationPart =
      brief.neighborhood && !cityIncludesNeighborhood(city, brief.neighborhood)
        ? `${brief.neighborhood}, ${city}`
        : city

    const query =
      brief.type === "restaurant"
        ? `${keyword} restaurant in ${locationPart}`
        : brief.type === "drinks"
        ? `${keyword} bar in ${locationPart}`
        : `${keyword} in ${locationPart}`

    // Pull up to 20 — we need headroom so that even after multiple refreshes
    // there are fresh ones AND so the open-at-time filter has room to cut.
    const places = await placesTextSearch(query, { limit: 20 })
    // Fire-and-forget: track venue review counts over time so we can compute trends later.
    recordPlaceCandidates(places, city)

    // Drop venues closed at the slot's start time.
    const { day, minute } = slotDayAndMinute(brief.time, opts.targetDate)
    const openFiltered =
      minute != null
        ? places.filter((p) => isOpenAt(p.openingHours, day, minute))
        : places

    return openFiltered
      .filter((p) => (p.rating ?? 0) >= 4.0)
      .sort((a, b) => (b.ratingCount ?? 0) - (a.ratingCount ?? 0))
      .map((p) => placeToOption(p, city))
  }

  if (brief.type === "event") {
    const tm = await searchTicketmasterEvents({
      city,
      keyword,
      classificationName: brief.eventGenre,
      targetDate: opts.targetDate,
      size: 20,
    })
    return tm.map(ticketmasterToOption)
  }

  return []
}

function fallbackKeywordFor(type: SlotType): string | null {
  switch (type) {
    case "restaurant": return "restaurant"
    case "drinks": return "bar"
    case "activity": return "things to do"
    case "event": return ""  // empty keyword → TM returns all events in window
    default: return null
  }
}

/**
 * Returns the (day, minute) to check Places opening hours against.
 * - day: 0=Sunday..6=Saturday from the plan's targetDate (or today)
 * - minute: parsed from the slot's start time; null if unparseable (skip filter)
 */
function slotDayAndMinute(
  time: string,
  targetDate: string | undefined
): { day: number; minute: number | null } {
  const minute = parseSlotTimeToMinutes(time)
  const base = targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)
    ? new Date(`${targetDate}T12:00:00Z`)
    : new Date()
  return { day: base.getDay(), minute }
}

/**
 * Detects the (rare) case where the user's "city" string already contains the
 * neighborhood — e.g. user typed "Mission District, San Francisco, CA" and
 * Claude returned neighborhood: "Mission District". We don't want to repeat it
 * in the query and end up with "Mission District, Mission District, San Francisco".
 */
function cityIncludesNeighborhood(city: string, neighborhood: string): boolean {
  return city.toLowerCase().includes(neighborhood.toLowerCase())
}
