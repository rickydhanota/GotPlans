import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { resolveSlotOptions, type PlanSlot } from "@/lib/plan-slots"

interface RegenBody {
  slotIdx: number
}

function validate(body: unknown): RegenBody | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  if (typeof b.slotIdx !== "number" || b.slotIdx < 0) return null
  return { slotIdx: b.slotIdx }
}

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

  // Load the plan
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

  // Plans created before the refresh feature shipped don't carry `keyword`.
  // We can't re-search without it.
  if (!slot.keyword) {
    return NextResponse.json(
      { error: "This plan was saved before refresh was supported. Create a new plan to use this." },
      { status: 422 }
    )
  }

  // Refusing to refresh a locked slot keeps user intent intact.
  if (slot.lockedIdx != null) {
    return NextResponse.json(
      { error: "Slot is locked. Unlock it before refreshing." },
      { status: 409 }
    )
  }

  const city = (plan.inputs as { city?: string })?.city
  if (!city) {
    return NextResponse.json({ error: "Plan is missing location" }, { status: 422 })
  }

  // Run search excluding everything we've shown so far
  const { options, freshIds } = await resolveSlotOptions(
    {
      type: slot.type,
      time: slot.time,
      duration: slot.duration,
      intent: slot.intent,
      keyword: slot.keyword,
      eventGenre: slot.eventGenre,
    },
    city,
    slot.seenIds ?? []
  )

  if (options.length === 0) {
    return NextResponse.json(
      { error: "No more fresh options for this slot. We've shown you everything that matches." },
      { status: 404 }
    )
  }

  const updatedSlot: PlanSlot = {
    ...slot,
    options,
    seenIds: [...(slot.seenIds ?? []), ...freshIds],
    lockedIdx: null,
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
