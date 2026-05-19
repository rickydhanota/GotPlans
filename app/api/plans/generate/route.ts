import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { anthropic } from "@/lib/anthropic"
import { supabaseAdmin } from "@/lib/supabase-admin"
import {
  resolveSlotOptions,
  allocateBudgets,
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
  /**
   * Optional plan date as YYYY-MM-DD. When set, Ticketmaster results are
   * narrowed to that single day and Place hours are checked against that
   * weekday. Form doesn't capture this yet; safe to omit.
   */
  date?: string
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are GotPlans AI, an expert curator of memorable dates and group outings. Your job is to design the STRUCTURE of an itinerary — what types of activities, in what order, with what theme. The actual venue selection happens after you, by querying real local data.

You design 2 to 5 slots that flow naturally and stay within budget. A tight 2-slot plan is preferable to a padded 4-slot plan with stuff the user didn't ask for. Each slot has:
- A type: restaurant, drinks, event, or activity
- A starting time and duration
- An intent (a short evocative description of the slot's vibe)
- A keyword that will be used to search real local venues/events

Rules:
- Sequence chronologically with realistic times.
- Keep total per-person cost within the user's budget.
- Match the energy: solo = intimate, date = romantic, friends = social, big group = high-energy, family = approachable.
- Default to broadly mainstream venues and events that fit stated preferences. Do NOT introduce niche or themed experiences (drag, burlesque, themed dance nights, religious or political gatherings, etc.) unless the user explicitly mentions them.
- For family plans, keep all suggestions family-friendly and age-appropriate.

CRITICAL — Strict slot-type scoping (do not pad plans with things the user didn't ask for):
- restaurant slots: ONLY include if the user opted into food. If they listed specific cuisines or dishes, every restaurant slot must reflect one of those.
- drinks slots: ONLY include if the user explicitly listed a drinks-related preference (e.g. "cocktail bar", "wine bar", "speakeasy", "rooftop", "brewery", "lounge") in their cuisines, OR explicitly listed "nightlife" in event preferences. Food=yes alone does NOT imply drinks. A user who picked "Mexican food + comedy show" wants exactly that — do NOT add a drinks slot to "round out" the evening.
- event slots: ONLY include if the user opted into events. If they listed specific event types (music, comedy, sports, etc.), every event slot must match one of those types.
- activity slots: ONLY include when the user picked an activity-type preference (museum, gallery, park, bowling, mini-golf, escape room, etc.) — typically appearing in their cuisines/keywords or written into events. Do NOT add a generic "walk around the neighborhood" or "explore the area" activity slot just to hit 3+ slots.
- If after applying the above the plan only has 2 slots (e.g. one restaurant + one event), output 2 slots. A focused, tight 2-slot plan is BETTER than a padded 4-slot plan with stuff the user didn't request. The minimum is 2 in this case — do not force a third type to appear.

CRITICAL — Realistic scheduling:
- Honor meal-time conventions: brunch 10am–1pm, lunch 12pm–2pm, dinner 6pm–9pm, late dinner up to 10pm. Do NOT schedule "dinner" at 4pm or 11pm without an explicit reason.
- Drinks slots come AFTER dinner, not before (unless it's a pre-dinner cocktail intentionally — say so in the intent).
- Activities and museums typically run during daytime/early evening; nightlife and shows live after 8pm.
- Leave at least 30 minutes of slack between slots for walking, ordering, and unwinding. If two slots are back-to-back with no buffer, the user will feel rushed.
- A slot's duration should reflect reality: dinner 1.5–2 hrs, drinks 1–1.5 hrs, a concert 2–3 hrs, a museum visit 1.5–2 hrs.
- For an event slot, the slot's "time" should match when the show typically STARTS in that city (most concerts: 7:30–9pm, most sports games: 7pm, most comedy: 8–10pm). The downstream system filters Ticketmaster to events near this time, so being off by 4+ hours will return nothing.

CRITICAL — Geographic cohesion:
- Pick ONE neighborhood or adjacent walking-distance area as the anchor for the entire plan. Set this as the top-level "neighborhood" field. All slots must be within walking or short driving distance (15 minutes max) of each other.
- For large cities, this is essential — a Mission District plan should stay in or near the Mission, not jump to the Marina between slots. Examples of good neighborhood anchors:
  * SF: Mission, Hayes Valley, North Beach, Marina, SoMa, Chinatown
  * NYC: East Village, LES, Williamsburg, West Village, Tribeca, Chelsea, Park Slope
  * LA: Silver Lake, Echo Park, Hollywood, Venice, Santa Monica, DTLA, K-Town
  * Chicago: Wicker Park, Logan Square, River North, West Loop, Lakeview
  * Miami: Wynwood, South Beach, Brickell, Coconut Grove, Little Havana
- Choose a neighborhood that fits the vibe (e.g. romantic date → North Beach in SF; big-group party → Wicker Park in Chicago).
- For smaller cities (under ~150k population), the city itself is the neighborhood — just set it to the city name.
- If the user named a specific neighborhood already (e.g. "Mission, SF"), use that.
- Reflect the neighborhood in slot intents ("cozy Italian dinner in the Mission") so the framing stays consistent.

CRITICAL — Slot type rules (this is how we route to the right data source):
- type="event" MUST be used for anything ticketed: concerts, live music shows, sports games, comedy shows, theater, festivals, ticketed nightlife. These will be searched against Ticketmaster — pick this type whenever the user wants to attend a SHOW, GAME, MATCH, CONCERT, or PERFORMANCE. Always set eventGenre when type=event.
- type="restaurant" for sit-down meals (any cuisine).
- type="drinks" for bars, cocktail lounges, wine bars, breweries (no food primary).
- type="activity" ONLY for non-ticketed experiences: museums, galleries, parks, mini-golf, bowling, escape rooms, tourist attractions, scenic walks. NEVER use activity for concerts, games, or any ticketed entertainment.

Keyword guidance:
- For event slots, the keyword should be a searchable genre or category — NOT a full vibe descriptor. Examples: "jazz" (not "intimate jazz vibe"), "basketball" (not "playoff atmosphere"), "stand-up comedy" (not "edgy comedy mood"). The vibe goes into the intent; the keyword feeds the Ticketmaster search.
- For restaurant slots, use the cuisine or specific dish: "Italian", "ramen", "butter chicken".
- For drinks: "cocktail bar", "wine bar", "rooftop", "speakeasy".
- For activities: the venue type — "art museum", "bowling alley", "mini golf".

Vibe translation (when the user provides mood descriptors like "intimate jazz" or "chill lounge"):
- Use the mood to inform the slot's intent.
- Derive a clean, searchable keyword from it. Examples:
  * music (intimate jazz) → keyword "jazz", intent "intimate jazz lounge"
  * comedy (edgy stand-up) → keyword "stand-up comedy", intent "edgy stand-up showcase"
  * sports (playoff basketball) → keyword "basketball", intent "playoff basketball energy"
  * nightlife (chill lounge) → consider this a drinks slot rather than event, keyword "lounge bar"`

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

  lines.push(`Output a 2-5 slot itinerary structure that fits ONLY what was requested above. Do not pad with drinks, activities, or anything else not explicitly listed.`)
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
      neighborhood: {
        type: "string",
        description: "The single neighborhood (or small adjacent area) that anchors the whole plan, e.g. 'Mission District' in SF, 'East Village' in NYC. For smaller cities, this is the city name itself. All slot searches are scoped to this area for geographic cohesion.",
      },
      slots: {
        type: "array",
        minItems: 2,
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
    required: ["title", "summary", "neighborhood", "slots"],
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

  const date =
    typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date)
      ? b.date
      : undefined

  return {
    groupSize: b.groupSize,
    eat: b.eat,
    events: b.events,
    budget: Math.max(20, Math.min(500, b.budget)),
    city: b.city.trim().slice(0, 200),
    cuisines: (b.cuisines as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 20),
    eventTypes: (b.eventTypes as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 20),
    eventDetails,
    date,
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
  let structure: { title: string; summary: string; neighborhood: string; slots: SlotBrief[] }
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

  // Step 2 — fetch real candidates for each slot in parallel, scoped to the
  // plan's anchor neighborhood for geographic cohesion. Each slot gets a
  // share of the total budget based on type weights (dinner > drinks).
  const budgets = allocateBudgets(structure.slots, inputs.budget)
  const resolvedSlots: PlanSlot[] = await Promise.all(
    structure.slots.map(async (brief, i) => {
      const briefWithNeighborhood: SlotBrief = {
        ...brief,
        neighborhood: brief.neighborhood ?? structure.neighborhood,
      }
      const budgetCap = budgets[i]
      const { options, freshIds } = await resolveSlotOptions(
        briefWithNeighborhood,
        inputs.city,
        [],
        { targetDate: inputs.date, budgetCap }
      )
      return {
        type: briefWithNeighborhood.type,
        time: briefWithNeighborhood.time,
        duration: briefWithNeighborhood.duration,
        intent: briefWithNeighborhood.intent,
        keyword: briefWithNeighborhood.keyword,
        eventGenre: briefWithNeighborhood.eventGenre,
        neighborhood: briefWithNeighborhood.neighborhood,
        options,
        seenIds: freshIds,
        lockedIdxs: [],
        budgetCap,
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
