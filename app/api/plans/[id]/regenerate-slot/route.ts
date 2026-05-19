import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { resolveSlotOptions, getLockedIdxSet, type PlanSlot } from "@/lib/plan-slots"

interface RegenBody {
  slotIdx: number
}

function validate(body: unknown): RegenBody | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  if (typeof b.slotIdx !== "number" || b.slotIdx < 0) return null
  return { slotIdx: b.slotIdx }
}

const TOTAL_OPTIONS_PER_SLOT = 3

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json().catch(() => null)
  const input = validate(body)
  if (!input) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const { data: plan, error: loadErr } = await supabaseAdmin
    .from("plans")
    .select("items, inputs")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .single()

  if (loadErr || !plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const slots = (plan.items ?? []) as PlanSlot[]
  if (input.slotIdx >= slots.length) {
    return NextResponse.json({ error: "Slot index out of range" }, { status: 400 })
  }

  const slot = slots[input.slotIdx]
  if (!slot.keyword) {
    return NextResponse.json(
      { error: "This plan was saved before refresh was supported. Create a new plan to use this." },
      { status: 422 }
    )
  }

  const planInputs = plan.inputs as {
    city?: string
    date?: string
    distance?: "walking" | "short-ride" | "anywhere"
  } | null
  const city = planInputs?.city
  if (!city) {
    return NextResponse.json({ error: "Plan is missing location" }, { status: 422 })
  }
  const targetDate = planInputs?.date
  const distance = planInputs?.distance

  // Snapshot the locked options BEFORE we rebuild. Sorted by current index so
  // the new array preserves the user's visual ordering of locks (locked items
  // end up at indices 0..N-1 in the same relative order).
  const lockedSet = getLockedIdxSet(slot)
  const lockedIndicesSorted = [...lockedSet].sort((a, b) => a - b)
  const lockedOptions = lockedIndicesSorted
    .map((i) => slot.options[i])
    .filter(Boolean)
  const keepCount = lockedOptions.length
  const refreshSize = TOTAL_OPTIONS_PER_SLOT - keepCount

  if (refreshSize <= 0) {
    return NextResponse.json(
      { error: "All options are locked. Unlock one to refresh." },
      { status: 409 }
    )
  }

  // Run search, excluding everything we've shown so far (incl. locked ones —
  // they get prepended manually).
  const { options: fresh, freshIds } = await resolveSlotOptions(
    {
      type: slot.type,
      time: slot.time,
      duration: slot.duration,
      intent: slot.intent,
      keyword: slot.keyword,
      eventGenre: slot.eventGenre,
      neighborhood: slot.neighborhood,
    },
    city,
    slot.seenIds ?? [],
    { targetDate, budgetCap: slot.budgetCap, distance }
  )

  if (fresh.length === 0 && keepCount === 0) {
    return NextResponse.json(
      { error: "No more fresh options for this slot. We've shown you everything that matches." },
      { status: 404 }
    )
  }

  // New options array: locked first (preserving order), then up to refreshSize fresh.
  const newOptions = [...lockedOptions, ...fresh.slice(0, refreshSize)]

  // Locked items are now at indices 0..keepCount-1
  const newLockedIdxs = Array.from({ length: keepCount }, (_, i) => i)

  const updatedSlot: PlanSlot = {
    ...slot,
    options: newOptions,
    seenIds: [...(slot.seenIds ?? []), ...freshIds],
    lockedIdxs: newLockedIdxs,
    lockedIdx: null,  // clear the legacy field so it can't shadow lockedIdxs
  }
  const updatedSlots = slots.map((s, i) => (i === input.slotIdx ? updatedSlot : s))

  const { error: writeErr } = await supabaseAdmin
    .from("plans")
    .update({ items: updatedSlots })
    .eq("id", id)
    .eq("user_id", session.user.id)

  if (writeErr) {
    console.error("Regen update failed:", writeErr)
    return NextResponse.json({ error: "Could not save refreshed options" }, { status: 500 })
  }

  return NextResponse.json({ slot: updatedSlot })
}
