import { auth } from "@/auth"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, MapPin, Wallet, Users, Sparkles, Plus, Route,
  UtensilsCrossed, Music, Wine, Camera, Star,
} from "lucide-react"
import PlanSlotCard from "./PlanSlotCard"

interface PlanOption {
  source: "google_places" | "ticketmaster" | "eventbrite"
  name: string
  address?: string
  city?: string
  rating?: number
  ratingCount?: number
  priceLevel?: number
  estimatedCost?: number
  imageUrl?: string
  externalUrl?: string
  externalId?: string
  eventDate?: string
  actions: {
    primary?: { label: string; href: string }
    directions?: string
  }
}

interface PlanSlot {
  type: "restaurant" | "drinks" | "event" | "activity"
  time: string
  duration: string
  intent: string
  keyword?: string
  eventGenre?: string
  options: PlanOption[]
  seenIds?: string[]
  lockedIdx?: number | null
}

interface PlanRow {
  id: string
  title: string
  summary: string
  inputs: { city: string; budget: number; groupSize: string; distance?: "walking" | "short-ride" | "anywhere" }
  items: PlanSlot[]
  created_at: string
}

const GROUP_LABELS: Record<string, string> = {
  solo: "Just me",
  date: "Date night",
  small: "Friends",
  big: "Big group",
  family: "Family",
}

const DISTANCE_LABELS: Record<string, string> = {
  walking: "Walking distance",
  "short-ride": "Short ride",
  anywhere: "Anywhere in city",
}

export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")

  const { data, error } = await supabaseAdmin
    .from("plans")
    .select("id, title, summary, inputs, items, created_at")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .single()

  if (error || !data) notFound()
  const plan = data as PlanRow

  // Filter out malformed slots (e.g. plans saved under the old single-item schema)
  const slots = (plan.items ?? []).filter(
    (s): s is PlanSlot => Array.isArray(s?.options) && s.options.length > 0
  )

  // Estimated cost based on the first option in each slot (the "default" pick)
  const estimatedTotal = slots.reduce(
    (sum, slot) => sum + (slot.options[0]?.estimatedCost ?? 0),
    0
  )

  return (
    <div className="min-h-screen bg-[#0B0814] flex flex-col">
      {/* Header */}
      <header className="px-4 pt-4 pb-3 flex items-center justify-between">
        <Link
          href="/dashboard"
          className="w-10 h-10 rounded-full flex items-center justify-center border border-[#322C48] text-[#aaa] hover:text-white hover:border-[#444] active:scale-90 transition-all"
        >
          <ArrowLeft size={18} />
        </Link>
        <Link
          href="/"
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border border-[#322C48] text-[#bbb] hover:text-white hover:border-[#444] transition-all"
          style={{ fontFamily: "var(--font-satoshi)" }}
        >
          <Plus size={14} />
          New plan
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto px-5 pb-20">
        <div className="max-w-md mx-auto">
          {/* Title block */}
          <div className="pt-6 pb-8">
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-4 text-xs font-medium"
              style={{
                background: "rgba(123,97,255,0.12)",
                color: "#9B85FF",
                fontFamily: "var(--font-satoshi)",
              }}
            >
              <Sparkles size={12} />
              AI-curated · {slots.length} stops
            </div>
            <h1
              className="text-[34px] leading-[1.1] font-semibold text-white mb-3 tracking-tight"
              style={{ fontFamily: "var(--font-clash)" }}
            >
              {plan.title}
            </h1>
            <p
              className="text-[#888] text-base leading-relaxed"
              style={{ fontFamily: "var(--font-satoshi)" }}
            >
              {plan.summary}
            </p>
          </div>

          {/* Meta strip */}
          <div className="flex flex-wrap gap-2 mb-8">
            <MetaChip icon={<MapPin size={14} />} label={plan.inputs.city} />
            <MetaChip icon={<Users size={14} />} label={GROUP_LABELS[plan.inputs.groupSize] ?? plan.inputs.groupSize} />
            <MetaChip icon={<Wallet size={14} />} label={`$${plan.inputs.budget}/person`} />
            {plan.inputs.distance && (
              <MetaChip icon={<Route size={14} />} label={DISTANCE_LABELS[plan.inputs.distance] ?? plan.inputs.distance} />
            )}
          </div>

          {/* Slots */}
          {slots.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#322C48] p-8 text-center">
              <p
                className="text-sm text-[#888]"
                style={{ fontFamily: "var(--font-satoshi)" }}
              >
                This plan was saved with an older format. Please create a new plan.
              </p>
              <Link
                href="/"
                className="inline-block mt-4 px-5 py-2.5 rounded-full text-sm font-medium text-white"
                style={{ backgroundColor: "#7B61FF", fontFamily: "var(--font-satoshi)" }}
              >
                Build a new one
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {slots.map((slot, idx) => (
                <PlanSlotCard key={idx} planId={plan.id} slotIdx={idx} slot={slot} />
              ))}
            </div>
          )}

          {/* Total */}
          {estimatedTotal > 0 && (() => {
            const budget = plan.inputs.budget
            const overBudget = budget > 0 && estimatedTotal > budget
            const pct = budget > 0 ? Math.min(100, Math.round((estimatedTotal / budget) * 100)) : 0
            const accent = overBudget ? "#FF6B6B" : "#7B61FF"
            return (
              <div className="mt-6 rounded-2xl border bg-[#14111E] p-5"
                style={{ borderColor: overBudget ? "rgba(255,107,107,0.4)" : "#262135" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-[#888]" style={{ fontFamily: "var(--font-satoshi)" }}>
                    Estimated total per person
                  </span>
                  <span
                    className="text-2xl font-semibold"
                    style={{ color: accent, fontFamily: "var(--font-clash)" }}
                  >
                    ${estimatedTotal}
                  </span>
                </div>
                {budget > 0 && (
                  <>
                    <div className="h-1.5 rounded-full bg-[#0B0814] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: accent }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs" style={{ fontFamily: "var(--font-satoshi)" }}>
                      <span className="text-[#666]">
                        {overBudget
                          ? `$${estimatedTotal - budget} over your $${budget} budget`
                          : `$${budget - estimatedTotal} under your $${budget} budget`}
                      </span>
                      <span className="text-[#555]">{pct}%</span>
                    </div>
                  </>
                )}
              </div>
            )
          })()}
        </div>
      </main>
    </div>
  )
}

function MetaChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-[#aaa] border border-[#262135] bg-[#14111E]"
      style={{ fontFamily: "var(--font-satoshi)" }}
    >
      {icon}
      {label}
    </div>
  )
}
