// Affiliate URL builders.
//
// These wrap external URLs with our affiliate IDs (when available) so we earn
// referral revenue on bookings/tickets. Affiliate IDs come from environment
// variables — fill them in once you've been accepted into each program.

const OPENTABLE_ID = process.env.OPENTABLE_AFFILIATE_ID
const TICKETMASTER_ID = process.env.TICKETMASTER_AFFILIATE_ID

/** Google Maps "search by name" link — works for any venue without an affiliate. */
export function googleMapsLink(query: string): string {
  const u = new URL("https://www.google.com/maps/search/")
  u.searchParams.set("api", "1")
  u.searchParams.set("query", query)
  return u.toString()
}

/**
 * OpenTable reservation search by venue name. If we have an affiliate ID, append
 * it as a tracking param. Once OpenTable accepts you into their affiliate
 * program, set OPENTABLE_AFFILIATE_ID in .env.local.
 */
export function openTableLink(venueName: string, city: string): string {
  const u = new URL("https://www.opentable.com/s")
  u.searchParams.set("term", venueName)
  u.searchParams.set("metroId", "") // OpenTable city ID (we don't resolve it yet)
  u.searchParams.set("regionIds", "")
  u.searchParams.set("dateTime", "")
  u.searchParams.set("covers", "2")
  if (OPENTABLE_ID) u.searchParams.set("ref", OPENTABLE_ID)
  // Fallback param: include city in query so search isn't empty
  u.searchParams.set("query", `${venueName} ${city}`)
  return u.toString()
}

/**
 * Wraps a Ticketmaster event URL with our affiliate ID via Impact (their
 * affiliate platform). When TICKETMASTER_AFFILIATE_ID is set, we append it
 * as the standard `irclickid` / `irgwc` params. Until then, returns the URL as-is.
 */
export function ticketmasterLink(eventUrl: string): string {
  if (!TICKETMASTER_ID) return eventUrl
  const u = new URL(eventUrl)
  u.searchParams.set("irgwc", "1")
  u.searchParams.set("clickid", TICKETMASTER_ID)
  return u.toString()
}
