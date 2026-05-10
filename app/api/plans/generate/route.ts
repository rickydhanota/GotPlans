import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { anthropic } from "@/lib/anthropic"
import { supabaseAdmin } from "@/lib/supabase-admin"
import {
  resolveSlotOptions,
  type SlotBrief,
  type PlanSlot,
} from "@/lib/plan-slots"
import type Anthropic from "@anthropic-ai/sdk"

// ─── Input shape ──────────────────────────────────────────────────────────────

interface PlanInputs {
  groupSize: string
  eat: "yes" | "no"
  cuisines: string[]
  budget: number
  events: "yes" | "no"
  eventTypes: string[]
  /** Per-type specifics, e.g. { sports: "Warriors", music: "indie rock" } */
  eventDetails: Record<string, string>
  city: string
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are GotPlans AI, an expert curator of memorable dates and group outings. Your job is to design the STRUCTURE of an itinerary — what types of activities, in what order, with what theme. The actual venue selection happens after you, by querying real local data.

You design 3 to 5 slots that flow naturally and stay within budget. Each slot has:
- A type: restaurant, drinks, event, or activity
- A starting time and duration
- An intent (a short evocative description of the slot's vibe)
- A keyword that will be used to search real local venues/events

Rules:
- Sequence chronologically with realistic times.
- Keep total per-person cost within the user's budget.
- Match the energy: solo = intimate, date = romantic, friends = social, big group = high-energy, family = approachable.
- If the user opted out of food, no restaurant or drinks slots.
- If they opted out of events, no event slots.
- Default to broadly mainstream venues and events that fit stated preferences. Do NOT introduce niche or themed experiences (drag, burlesque, themed dance nights, religious or political gatherings, etc.) unless the user explicitly mentions them.
- For family plans, keep all suggestions family-friendly and age-appropriate.

CRITICAL — Slot type rules (this is how we route to the right data source):
- type="event" MUST be used for anything ticketed: concerts, live music shows, sports games, comedy shows, theater, festivals, ticketed nightlife. These will be searched against Ticketmaster — pick this type whenever the user wants to attend a SHOW, GAME, MATCH, CONCERT, or PERFORMANCE. Always set eventGenre when type=event.
- type="restaurant" for sit-down meals (any cuisine).
- type="drinks" for bars, cocktail lounges, wine bars, breweries (no food primary).
- type="activity" ONLY for non-ticketed experiences: museums, galleries, parks, mini-golf, bowling, escape rooms, tourist attractions, scenic walks. NEVER use activity for concerts, games, or any ticketed entertainment.

Keyword guidance:
- For event slots, the keyword should match what would appear on a ticket page. Examples: "Warriors" (for a sports game), "indie rock" (genre), "John Mulaney" (comedian), "Hamilton" (show name).
- For restaurant slots, use the cuisine or specific dish: "Italian", "ramen", "butter chicken".
- For drinks: "cocktail bar", "wine bar", "rooftop".
- For activities: the venue type — "art museum", "bowling alley", "mini golf".`

const GROUP_LABELS: Record<string, string> = {
  solo: "solo (just one person)",
  date: "a date (2 people)",
  small: "a small group of 3 to 5 friends",
  big: "a big group of 6 or more people",
  family: "a family",
}

function buildUserPrompt(i: PlanInputs): string {
  const lines: string[] = []
  lines.push(`Plan an outing in ${i.city} for ${GROUP_LABELS[i.groupSize] ?? i.groupSize}.`)
  lines.push(`Budget: $${i.budget} per person (food, drinks, and tickets combined).`)

  if (i.eat === "yes") {
    if (i.cuisines.length > 0) {
      lines.push(
        `Food preferences (a mix of cuisines and/or specific dishes): ${i.cuisines.join(", ")}. ` +
        `If a preference is a specific dish (e.g. "butter chicken", "ramen"), use the dish itself as the keyword for that slot.`
      )
    } else {
      lines.push(`Open to any cuisine.`)
    }
  } else {
    lines.push(`Skip food entirely — no restaurants or drinks slots.`)
  }

  if (i.events === "yes") {
    if (i.eventTypes.length > 0) {
      const formatted = i.eventTypes.map((t) => {
        const detail = i.eventDetails[t]?.trim()
        return detail ? `${t} (specifically: ${detail})` : t
      })
      lines.push(`Event preferences: ${formatted.join(", ")}.`)
      lines.push(
        `For any event with a specific detail in parentheses, use that detail as the keyword for the event slot ` +
        `(e.g. sports → "Warriors", music → "indie rock", comedy → "John Mulaney"). This drives the Ticketmaster search.`
      )
    } else {
      lines.push(`Up for any kind of event.`)
    }
  } else {
    lines.push(`Skip events — no ticketed event slots.`)
  }

  lines.push(`Output a 3-5 slot itinerary structure that fits the vibe.`)
  return lines.join("\n")
}

// ─── Tool ─────────────────────────────────────────────────────────────────────

const PLAN_TOOL: Anthropic.Tool = {
  name: "create_plan_structure",
  description: "Output the curated plan structure as slots. Each slot becomes a venue/event search.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short evocative title (max 60 chars)." },
      summary: { type: "string", description: "One-line plan summary (max 120 chars)." },
      slots: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["restaurant", "drinks", "event", "activity"] },
            time: { type: "string", description: "Start time, e.g. '7:00 PM'." },
            duration: { type: "string", description: "Estimated duration, e.g. '1.5 hours'." },
            intent: { type: "string", description: "Short framing of this slot's vibe (e.g. 'Cozy Italian dinner')." },
            keyword: { type: "string", description: "Search keyword for finding real venues/events." },
            eventGenre: {
              type: "string",
              description: "Only for type=event. One of: music, comedy, theater, sports, movies, festivals, nightlife. Or a custom user-provided value.",
            },
          },
          required: ["type", "time", "duration", "intent", "keyword"],
        },
      },
    },
    required: ["title", "summary", "slots"],
  },
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateInputs(body: unknown): PlanInputs | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  if (typeof b.groupSize !== "string" || !b.groupSize) return null
  if (b.eat !== "yes" && b.eat !== "no") return null
  if (b.events !== "yes" && b.events !== "no") return null
  if (typeof b.budget !== "number") return null
  if (typeof b.city !== "string" || !b.city.trim()) return null
  if (!Array.isArray(b.cuisines) || !Array.isArray(b.eventTypes)) return null

  const rawDetails = (b.eventDetails && typeof b.eventDetails === "object")
    ? (b.eventDetails as Record<string, unknown>)
    : {}
  const eventDetails: Record<string, string> = {}
  for (const [k, v] of Object.entries(rawDetails)) {
    if (typeof k === "string" && typeof v === "string" && v.trim()) {
      eventDetails[k.slice(0, 64)] = v.trim().slice(0, 200)
    }
  }

  return {
    groupSize: b.groupSize,
    eat: b.eat,
    events: b.events,
    budget: Math.max(20, Math.min(500, b.budget)),
    city: b.city.trim().slice(0, 200),
    cuisines: (b.cuisines as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 20),
    eventTypes: (b.eventTypes as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 20),
    eventDetails,
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const inputs = validateInputs(body)
  if (!inputs) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  // Step 1 — Claude designs the plan structure
  let structure: { title: string; summary: string; slots: SlotBrief[] }
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(inputs) }],
      tools: [PLAN_TOOL],
      tool_choice: { type: "tool", name: "create_plan_structure" },
    })
    const toolUse = message.content.find(
      (c): c is Anthropic.ToolUseBlock => c.type === "tool_use"
    )
    if (!toolUse) throw new Error("No tool_use block in Claude response")
    structure = toolUse.input as typeof structure
  } catch (err) {
    console.error("Claude generation error:", err)
    return NextResponse.json({ error: "AI generation failed" }, { status: 502 })
  }

  // Step 2 — fetch real candidates for each slot in parallel
  const resolvedSlots: PlanSlot[] = await Promise.all(
    structure.slots.map(async (brief) => {
      const { options, freshIds } = await resolveSlotOptions(brief, inputs.city, [])
      return {
        type: brief.type,
        time: brief.time,
        duration: brief.duration,
        intent: brief.intent,
        keyword: brief.keyword,
        eventGenre: brief.eventGenre,
        options,
        seenIds: freshIds,
        lockedIdx: null,
      }
    })
  )

  // Drop slots with zero options
  const finalSlots = resolvedSlots.filter((s) => s.options.length > 0)

  if (finalSlots.length === 0) {
    return NextResponse.json(
      { error: "Couldn't find venues matching your preferences. Try broadening them or a different city." },
      { status: 422 }
    )
  }

  // Step 3 — save
  const { data, error } = await supabaseAdmin
    .from("plans")
    .insert({
      user_id: session.user.id,
      title: structure.title,
      summary: structure.summary,
      inputs,
      items: finalSlots,
    })
    .select("id")
    .single()

  if (error || !data) {
    console.error("Supabase insert error:", error)
    return NextResponse.json({ error: "Could not save plan" }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}
