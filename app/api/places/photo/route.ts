// Google Places photo proxy.
//
// Why this exists: Google Places photo URLs require an API key in the query
// string. Putting the raw URL in <img src=...> would leak the key. This route
// fetches the photo server-side using our key and streams the result back to
// the browser. The key never leaves the server.
//
// Usage:  /api/places/photo?name=places/<placeId>/photos/<photoId>&w=800
//
// We validate that `name` matches the expected Places photo path format so
// nobody can use this as a generic SSRF proxy to arbitrary URLs.

import { NextResponse } from "next/server"

const apiKey = process.env.GOOGLE_PLACES_API_KEY

// Allowed shape: "places/<id>/photos/<id>"
const PHOTO_NAME_RE = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/

export async function GET(req: Request) {
  if (!apiKey) {
    return new NextResponse("Photo service not configured", { status: 503 })
  }

  const url = new URL(req.url)
  const name = url.searchParams.get("name")
  const w = url.searchParams.get("w")

  if (!name || !PHOTO_NAME_RE.test(name)) {
    return new NextResponse("Invalid photo name", { status: 400 })
  }

  const maxWidthPx = Math.max(64, Math.min(2000, Number(w) || 800))

  const upstream = new URL(`https://places.googleapis.com/v1/${name}/media`)
  upstream.searchParams.set("key", apiKey)
  upstream.searchParams.set("maxWidthPx", String(maxWidthPx))

  const res = await fetch(upstream.toString(), {
    // Photos rarely change; let upstream cache decisions inform ours.
    next: { revalidate: 60 * 60 * 24 * 7 },
  })

  if (!res.ok) {
    return new NextResponse("Upstream error", { status: res.status })
  }

  // Pass the image bytes straight through. Cache aggressively at the edge —
  // photo refs are stable as long as Google doesn't rotate them.
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400, s-maxage=2592000, immutable",
    },
  })
}
