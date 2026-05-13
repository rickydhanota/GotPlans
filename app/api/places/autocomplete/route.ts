// City autocomplete proxy.
//
// Calls Google Places API (New) Autocomplete on the server using our API key,
// filtered to localities only so we get clean "City, State" suggestions —
// not random venues or businesses.
//
// Docs: https://developers.google.com/maps/documentation/places/web-service/place-autocomplete

import { NextResponse } from "next/server"

const apiKey = process.env.GOOGLE_PLACES_API_KEY

export interface CitySuggestion {
  /** Full text suitable for display + storing as the city value. e.g. "San Jose, CA, USA" */
  full: string
  /** Primary line — usually just the city. e.g. "San Jose" */
  main: string
  /** Secondary line — usually "State, Country". e.g. "CA, USA" */
  secondary: string
  placeId: string
}

interface RawSuggestion {
  placePrediction?: {
    placeId: string
    text?: { text?: string }
    structuredFormat?: {
      mainText?: { text?: string }
      secondaryText?: { text?: string }
    }
  }
}

interface AutocompleteResponse {
  suggestions?: RawSuggestion[]
}

export async function GET(req: Request) {
  if (!apiKey) {
    return NextResponse.json({ error: "Autocomplete not configured" }, { status: 503 })
  }

  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.trim() ?? ""

  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }
  if (q.length > 100) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 })
  }

  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify({
      input: q,
      // Filter to cities/towns. "locality" = cities; "administrative_area_level_3"
      // catches some unincorporated areas users might type.
      includedPrimaryTypes: ["locality", "administrative_area_level_3"],
      // No regionCode — let users plan in any country.
    }),
    // Cache for 1h at the edge (city names are stable; same query stays valid)
    next: { revalidate: 3600 },
  })

  if (!res.ok) {
    console.warn(`Autocomplete HTTP ${res.status} for "${q}"`)
    return NextResponse.json({ suggestions: [] })
  }

  const data = (await res.json()) as AutocompleteResponse
  const suggestions: CitySuggestion[] = (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .slice(0, 6)
    .map((p) => ({
      placeId: p.placeId,
      full: p.text?.text ?? p.structuredFormat?.mainText?.text ?? "",
      main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondary: p.structuredFormat?.secondaryText?.text ?? "",
    }))
    .filter((s) => s.full)

  return NextResponse.json({ suggestions })
}
