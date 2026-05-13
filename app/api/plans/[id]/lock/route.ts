import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { supabaseAdmin } from "@/lib/supabase-admin"
import type { PlanSlot } from "@/lib/plan-slots"

interface LockBody {
  slotIdx: number
  /** New full set of locked option indices for this slot. Send [] to unlock all. */
  lockedIdxs: number[]
}

function validate(body: unknown): LockBody | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  if (typeof b.slotIdx !== "number" || b.slotIdx < 0) return null
  if (!Array.isArray(b.lockedIdxs)) return null
  // Each entry must be a non-negative integer
  const indices: number[] = []
  for (const v of b.lockedIdxs) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return null
    indices.push(v)
  }
  return { slotIdx: b.slotIdx, lockedIdxs: indices }
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

  const { data: plan, error: loadErr } = await supabaseAdmin
    .from("plans")
    .select("items")
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

  // All requested indices must be within bounds of the slot's current options
  const slot = slots[input.slotIdx]
  for (const idx of input.lockedIdxs) {
    if (idx >= slot.options.length) {
      return NextResponse.json({ error: "Option index out of range" }, { status: 400 })
    }
  }

  // Dedupe + sort for stable storage
  const deduped = [...new Set(input.lockedIdxs)].sort((a, b) => a - b)

  const updatedSlots = slots.map((s, i) =>
    i === input.slotIdx
      ? {
          ...s,
          lockedIdxs: deduped,
          // Clear the deprecated single-lock field so it doesn't shadow lockedIdxs
          lockedIdx: null,
        }
      : s
  )

  const { error: writeErr } = await supabaseAdmin
    .from("plans")
    .update({ items: updatedSlots })
    .eq("id", id)
    .eq("user_id", session.user.id)

  if (writeErr) {
    console.error("Lock update failed:", writeErr)
    return NextResponse.json({ error: "Could not save lock" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, lockedIdxs: deduped })
}
