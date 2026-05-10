import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { supabaseAdmin } from "@/lib/supabase-admin"
import type { PlanSlot } from "@/lib/plan-slots"

interface LockBody {
  slotIdx: number
  /** Pass null to unlock. */
  optionIdx: number | null
}

function validate(body: unknown): LockBody | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  if (typeof b.slotIdx !== "number" || b.slotIdx < 0) return null
  if (b.optionIdx !== null && (typeof b.optionIdx !== "number" || b.optionIdx < 0)) return null
  return { slotIdx: b.slotIdx, optionIdx: b.optionIdx as number | null }
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

  // Load the plan and verify ownership
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

  // Validate the optionIdx is within range when locking
  if (input.optionIdx != null && input.optionIdx >= slots[input.slotIdx].options.length) {
    return NextResponse.json({ error: "Option index out of range" }, { status: 400 })
  }

  // Update the lock state
  const updatedSlots = slots.map((s, i) =>
    i === input.slotIdx ? { ...s, lockedIdx: input.optionIdx } : s
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

  return NextResponse.json({ ok: true, lockedIdx: input.optionIdx })
}
