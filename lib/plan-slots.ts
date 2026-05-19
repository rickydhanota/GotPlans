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
import { recordPlaceCandidates, getTrendingVenues, type TrendingVenue } from "@/lib/venue-trends"
import { getEditorialPicks } from "@/lib/editorial"
import type { EditorialPick } from "@/lib/editorial/eater"

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
  /** Why this venue rose to the top — surfaced on the card. */
  badges?: PlanOptionBadge[]
  actions: {
    primary?: { label: string; href: string }
    directions?: string
  }
}

/**
 * Small tag explaining why a venue made the cut. Rendered as a chip on the card.
 * Kept short so multiple can stack: "Eater pick", "Trending +18%", "Top rated".
 */
export interface PlanOptionBadge {
  kind: "editorial" | "trending" | "top-rated"
  label: string
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
  /** Per-slot budget cap used when this slot was resolved. Informational. */
  budgetCap?: number
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

export function placeToOption(
  p: PlaceCandidate,
  city: string,
  badges?: PlanOptionBadge[]
): PlanOption {
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
    badges: badges && badges.length > 0 ? badges : undefined,
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

// ─── Budget allocation ────────────────────────────────────────────────────────

/**
 * Relative spend weights by slot type. A restaurant gets the lion's share, a
 * single drink slot is a sliver. We normalize across the actual slot mix so a
 * 4-restaurant plan still adds up to the user's budget instead of overshooting.
 */
const SLOT_WEIGHTS: Record<SlotType, number> = {
  restaurant: 40,
  event: 35,
  drinks: 15,
  activity: 15,
}

/**
 * Returns the per-slot budget cap in dollars, given the full plan's slot mix
 * and total per-person budget. Sum of all caps equals the budget.
 */
export function allocateBudgets(
  slots: { type: SlotType }[],
  totalBudget: number
): number[] {
  const weights = slots.map((s) => SLOT_WEIGHTS[s.type] ?? 20)
  const sum = weights.reduce((a, b) => a + b, 0) || 1
  return weights.map((w) => Math.round((w / sum) * totalBudget))
}

/** Map a dollar cap → max Google Places `priceLevel` we'll accept (0–4). */
function dollarsToMaxPriceLevel(cap: number): number {
  if (cap >= 90) return 4   // $$$$
  if (cap >= 50) return 3   // $$$
  if (cap >= 25) return 2   // $$
  return 1                  // $
}

// ─── The main resolver ────────────────────────────────────────────────────────

export type DistancePreference = "walking" | "short-ride" | "anywhere"

export interface ResolveSlotOpts {
  /**
   * Plan date as YYYY-MM-DD. Used for two things:
   *  - narrowing Ticketmaster results to that exact day
   *  - picking the weekday to check Place opening hours against
   * When omitted, today is used for the open-now check and TM falls back to a
   * 7-day window.
   */
  targetDate?: string
  /** Per-slot dollar budget cap. Filters out venues / events that overrun. */
  budgetCap?: number
  /**
   * How tightly slots must cluster. When "anywhere", we skip the neighborhood
   * filter on Places queries so results aren't artificially narrowed to the
   * anchor area.
   */
  distance?: DistancePreference
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
    // If we have a neighborhood anchor AND the user wants a tight plan,
    // scope the search to it so slots stay geographically clustered. When
    // distance="anywhere", drop the neighborhood and search citywide so we
    // surface the best venues regardless of proximity.
    const useNeighborhood =
      opts.distance !== "anywhere" &&
      brief.neighborhood &&
      !cityIncludesNeighborhood(city, brief.neighborhood)
    const locationPart = useNeighborhood
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
    // Fan out side-channels (trends, editorial) in parallel with the main search.
    const [places, trending, editorial] = await Promise.all([
      placesTextSearch(query, { limit: 20 }),
      brief.type === "restaurant" || brief.type === "drinks"
        ? safeTrending(city)
        : Promise.resolve([] as TrendingVenue[]),
      brief.type === "restaurant" ? safeEditorial(city) : Promise.resolve([] as EditorialPick[]),
    ])

    // Fire-and-forget: track venue review counts over time so we can compute trends later.
    recordPlaceCandidates(places, city)

    // Drop venues closed at the slot's start time.
    const { day, minute } = slotDayAndMinute(brief.time, opts.targetDate)
    const openFiltered =
      minute != null
        ? places.filter((p) => isOpenAt(p.openingHours, day, minute))
        : places

    // Drop venues that overrun the slot's budget cap (when one is set).
    const maxPriceLevel =
      opts.budgetCap != null ? dollarsToMaxPriceLevel(opts.budgetCap) : Infinity
    const budgetFiltered = openFiltered.filter(
      // Unknown priceLevel passes — better than excluding silently.
      (p) => p.priceLevel == null || p.priceLevel <= maxPriceLevel
    )

    const trendingByName = nameMap(trending, (t) => t.name)
    const editorialByName = nameMap(editorial, (e) => e.name)

    const scored = budgetFiltered
      .filter((p) => (p.rating ?? 0) >= 4.0)
      .map((p) => {
        const t = trendingByName.get(normName(p.name))
        const e = editorialByName.get(normName(p.name))
        const badges: PlanOptionBadge[] = []
        if (e) badges.push({ kind: "editorial", label: "Eater pick" })
        if (t && t.growthRate != null && t.growthRate > 0.05) {
          badges.push({ kind: "trending", label: `Trending +${Math.round(t.growthRate * 100)}%` })
        }
        if ((p.rating ?? 0) >= 4.6 && (p.ratingCount ?? 0) >= 500) {
          badges.push({ kind: "top-rated", label: "Top rated" })
        }
        return {
          place: p,
          score: rankScore(p, t, !!e),
          badges,
        }
      })
      .sort((a, b) => b.score - a.score)

    return scored.map(({ place, badges }) => placeToOption(place, city, badges))
  }

  if (brief.type === "event") {
    const tm = await searchTicketmasterEvents({
      city,
      keyword,
      classificationName: brief.eventGenre,
      targetDate: opts.targetDate,
      size: 20,
    })

    // Time alignment: when the slot calls for a 8pm show, drop events that
    // start more than ±3 hours away. Events without a start time pass through.
    const targetMin = parseSlotTimeToMinutes(brief.time)
    const TIME_WINDOW_MIN = 180
    const timeFiltered = tm.filter((e) => {
      if (targetMin == null || !e.timeLocal) return true
      const evMin = parseTimeLocal(e.timeLocal)
      if (evMin == null) return true
      return Math.abs(evMin - targetMin) <= TIME_WINDOW_MIN
    })

    // Budget filter: skip events whose minimum price already exceeds the cap.
    // Unknown prices pass (we don't want to drop most TM listings — they often
    // omit the price field).
    const cap = opts.budgetCap
    const budgetFiltered =
      cap == null
        ? timeFiltered
        : timeFiltered.filter((e) => e.priceMin == null || e.priceMin <= cap)

    return budgetFiltered.map(ticketmasterToOption)
  }

  return []
}

// ─── Scoring & blending ──────────────────────────────────────────────────────

/**
 * Composite ranking score. Replaces the old pure-`ratingCount DESC`. Weights:
 *  - log10(ratingCount): rewards popularity but damps so 500 vs 50000 isn't 100x
 *  - rating × 5: a 4.7 vs 4.0 swing matters
 *  - trending growthRate: small boost for momentum
 *  - editorial pick: large fixed boost (curated > algorithmic)
 */
function rankScore(
  p: PlaceCandidate,
  trending: TrendingVenue | undefined,
  isEditorial: boolean
): number {
  const popularity = Math.log10((p.ratingCount ?? 0) + 1) * 5  // 0..~3*5 = ~15
  const quality = (p.rating ?? 0) * 5                          // 0..25
  const trend = trending?.growthRate != null
    ? Math.min(trending.growthRate, 2) * 10                    // cap at +20 to avoid runaways
    : 0
  const editorialBoost = isEditorial ? 15 : 0
  return popularity + quality + trend + editorialBoost
}

async function safeTrending(city: string): Promise<TrendingVenue[]> {
  try {
    return await getTrendingVenues(city, { limit: 30 })
  } catch (err) {
    console.warn("trending lookup failed (non-fatal):", err)
    return []
  }
}

async function safeEditorial(city: string): Promise<EditorialPick[]> {
  try {
    const result = await getEditorialPicks("eater", city)
    return result?.picks ?? []
  } catch (err) {
    console.warn("editorial lookup failed (non-fatal):", err)
    return []
  }
}

/** Normalize a venue name for fuzzy lookup. */
function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function nameMap<T>(items: T[], getName: (t: T) => string): Map<string, T> {
  const m = new Map<string, T>()
  for (const it of items) {
    const k = normName(getName(it))
    if (k && !m.has(k)) m.set(k, it)
  }
  return m
}

/** Parse "20:00:00" or "20:00" → minutes-of-day. */
function parseTimeLocal(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mm = parseInt(m[2], 10)
  if (Number.isNaN(h) || Number.isNaN(mm) || h > 23 || mm > 59) return null
  return h * 60 + mm
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
