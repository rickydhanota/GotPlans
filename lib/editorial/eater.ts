// Eater "best new restaurants" parser.
//
// Strategy: Eater embeds a JSON-LD ItemList in each map page listing every
// featured restaurant — name, anchor URL, image. We use that as the canonical
// list, then walk the rendered HTML to enrich each entry with its description
// paragraph and Google Maps address link.
//
// Why this is OK to do: we're parsing a public page at low volume (cached for
// 24 hours per city in Supabase), attributing the source clearly in the UI,
// and linking back to the original article. We're not republishing the full
// editorial content.

import * as cheerio from "cheerio"

export interface EditorialPick {
  name: string
  /** Article anchor URL pointing back to Eater. */
  sourceUrl: string
  image?: string
  description?: string
  /** Free-text address ("123 Main St, San Francisco, CA"). */
  address?: string
}

interface JsonLdItemList {
  "@type": string
  itemListElement?: Array<{
    item?: {
      "@type"?: string
      name?: string
      url?: string
      image?: string
    }
  }>
}

// Map our internal city keys → Eater subdomain.
// Eater publishes for major markets only; smaller cities return null.
const EATER_SUBDOMAINS: Record<string, string> = {
  "san francisco": "sf",
  "oakland": "sf",
  "san jose": "sf",
  "los angeles": "la",
  "new york": "ny",
  "brooklyn": "ny",
  "chicago": "chicago",
  "boston": "boston",
  "philadelphia": "philly",
  "washington": "dc",
  "atlanta": "atlanta",
  "miami": "miami",
  "austin": "austin",
  "houston": "houston",
  "dallas": "dallas",
  "denver": "denver",
  "detroit": "detroit",
  "portland": "pdx",
  "seattle": "seattle",
  "vegas": "vegas",
  "las vegas": "vegas",
  "san diego": "sandiego",
  "nashville": "nashville",
  "new orleans": "nola",
  "twin cities": "twincities",
  "minneapolis": "twincities",
}

function eaterSubdomainFor(city: string): string | null {
  // Accept "San Francisco", "san-francisco", "San Francisco, CA" — all canonicalize
  // to "san francisco" before the map lookup.
  const key = city
    .toLowerCase()
    .trim()
    .replace(/\s*,.*$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
  return EATER_SUBDOMAINS[key] ?? null
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * Fetches Eater's "best new restaurants" heatmap for a city and parses it into
 * a list of picks. Returns null when Eater doesn't publish for the city.
 */
export async function fetchEaterPicks(city: string): Promise<EditorialPick[] | null> {
  const sub = eaterSubdomainFor(city)
  if (!sub) return null

  const url = `https://${sub}.eater.com/maps/best-new-restaurants-${sub === "sf" ? "san-francisco" : sub === "la" ? "los-angeles" : sub === "ny" ? "nyc" : sub}-heatmap`

  let html: string
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
      // Don't pollute Next's data cache — we have our own DB cache layer.
      cache: "no-store",
    })
    if (!res.ok) {
      console.warn(`Eater fetch ${res.status} for ${url}`)
      return null
    }
    html = await res.text()
  } catch (err) {
    console.warn(`Eater fetch failed for ${url}:`, err)
    return null
  }

  return parseEaterHtml(html)
}

/** Pure parser, exported for testability. */
export function parseEaterHtml(html: string): EditorialPick[] {
  const $ = cheerio.load(html)

  // 1) Pull the canonical list from JSON-LD
  let itemList: JsonLdItemList | null = null
  $('script[type="application/ld+json"]').each((_, el) => {
    if (itemList) return
    const raw = $(el).contents().text().trim()
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      const candidates = Array.isArray(parsed) ? parsed : [parsed]
      for (const c of candidates) {
        if (c?.["@type"] === "ItemList" && Array.isArray(c.itemListElement)) {
          itemList = c as JsonLdItemList
          return
        }
      }
    } catch {
      // Skip malformed JSON-LD blocks
    }
  })

  if (!itemList) return []

  // 2) For each restaurant, locate its anchor section in the HTML to grab the
  //    description paragraph and address link.
  const picks: EditorialPick[] = []
  // TS narrowing inside an each() callback gets confused; copy out and assert
  const list = itemList as JsonLdItemList
  for (const entry of list.itemListElement ?? []) {
    const item = entry.item
    if (!item?.name) continue

    const anchor = item.url ? item.url.split("#")[1] : null
    let description: string | undefined
    let address: string | undefined

    if (anchor) {
      // Eater renders each venue with the slug as an ID on a heading inside a card
      const heading = $(`#${cssEscape(anchor)}`).first()
      if (heading.length) {
        // Walk forward from the heading collecting prose until we hit the next venue heading
        const card = heading.closest(".c-mapstack__card, .c-entry-content, article, section")
        const root = card.length ? card : heading.parent()

        // Description: first non-empty paragraph after the heading
        const paragraphs = root.find("p").map((_, p) => $(p).text().trim()).get()
        description = paragraphs.find((p) => p.length > 40 && !/^\s*$/.test(p))

        // Address: usually inside a Google Maps link or a labeled element
        const mapsLink = root.find('a[href*="maps.google"], a[href*="google.com/maps"]').first()
        const mapsText = mapsLink.text().trim()
        if (mapsText && /\d/.test(mapsText)) {
          address = mapsText
        }
      }
    }

    picks.push({
      name: item.name,
      sourceUrl: item.url ?? "",
      image: item.image,
      description: description?.slice(0, 500),
      address,
    })
  }

  return picks
}

// CSS.escape() isn't available in Node — small fallback for slug-style IDs
function cssEscape(s: string): string {
  return s.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1")
}
