"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Shuffle, Sparkles, Check } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanFormData {
  groupType: string
  city: string
  locationVibes: string[]
  budget: number
  duration: string
  foodPrefs: string[]
  activityPrefs: string[]
}

const EMPTY_FORM: PlanFormData = {
  groupType: "",
  city: "",
  locationVibes: [],
  budget: 80,
  duration: "",
  foodPrefs: [],
  activityPrefs: [],
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const GROUP_OPTIONS = [
  { value: "solo", label: "Just me", emoji: "🙋" },
  { value: "date", label: "Date night", emoji: "💑" },
  { value: "small", label: "Small group (3–5)", emoji: "👫" },
  { value: "big", label: "Big group (6+)", emoji: "🎉" },
  { value: "family", label: "Family", emoji: "👨‍👩‍👧" },
]

const LOCATION_VIBES = ["Near me", "Downtown", "Waterfront", "Neighborhood spots"]

const DURATION_OPTIONS = [
  { value: "2-3hrs", label: "2–3 hrs" },
  { value: "half-day", label: "Half day" },
  { value: "full-day", label: "Full day" },
  { value: "evening", label: "Evening only" },
]

const FOOD_OPTIONS = [
  "Italian", "Japanese", "Mexican", "Indian",
  "Steakhouse", "Healthy", "Casual", "Wine bar",
]

const ACTIVITY_OPTIONS = [
  "Live music", "Movies", "Bowling", "Walking",
  "Art / Museum", "Bar hop", "Karaoke",
]

const TOTAL_STEPS = 5

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toggleArray(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]
}

function canAdvance(step: number, form: PlanFormData): boolean {
  switch (step) {
    case 1: return form.groupType !== ""
    case 2: return form.city.trim() !== ""
    case 3: return form.duration !== ""
    case 4: return form.foodPrefs.length > 0 || form.activityPrefs.length > 0
    default: return true
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Chip({
  label,
  selected,
  onClick,
  emoji,
}: {
  label: string
  selected: boolean
  onClick: () => void
  emoji?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium border transition-all"
      style={{
        fontFamily: "var(--font-satoshi)",
        backgroundColor: selected ? "#7B61FF" : "#111",
        borderColor: selected ? "#7B61FF" : "#2a2a2a",
        color: selected ? "#fff" : "#aaa",
        boxShadow: selected ? "0 0 16px rgba(123,97,255,0.25)" : "none",
      }}
    >
      {emoji && <span>{emoji}</span>}
      {label}
    </button>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4 py-4 border-b border-[#1a1a1a] last:border-0">
      <span className="text-[#555] text-sm w-28 flex-shrink-0" style={{ fontFamily: "var(--font-satoshi)" }}>
        {label}
      </span>
      <span className="text-white text-sm flex-1" style={{ fontFamily: "var(--font-satoshi)" }}>
        {value || "—"}
      </span>
    </div>
  )
}

// ─── Step Components ──────────────────────────────────────────────────────────

function StepWho({ form, setForm }: { form: PlanFormData; setForm: (f: PlanFormData) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <StepHeading
        step={1}
        title="Who's coming?"
        subtitle="Pick the vibe for your group"
      />
      <div className="flex flex-wrap gap-3">
        {GROUP_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            label={opt.label}
            emoji={opt.emoji}
            selected={form.groupType === opt.value}
            onClick={() => setForm({ ...form, groupType: opt.value })}
          />
        ))}
      </div>
    </div>
  )
}

function StepLocation({ form, setForm }: { form: PlanFormData; setForm: (f: PlanFormData) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <StepHeading
        step={2}
        title="Where are you headed?"
        subtitle="Enter your city or let us know the vibe"
      />
      <input
        type="text"
        value={form.city}
        onChange={(e) => setForm({ ...form, city: e.target.value })}
        placeholder="e.g. San Francisco, Chicago, Miami..."
        className="w-full px-4 py-3.5 rounded-xl border border-[#222] bg-[#111] text-white text-sm placeholder:text-[#444] focus:outline-none focus:border-[#7B61FF]/60 transition-colors"
        style={{ fontFamily: "var(--font-satoshi)" }}
      />
      <div>
        <p className="text-xs text-[#555] mb-3 uppercase tracking-wider" style={{ fontFamily: "var(--font-satoshi)" }}>
          Area preference
        </p>
        <div className="flex flex-wrap gap-2">
          {LOCATION_VIBES.map((vibe) => (
            <Chip
              key={vibe}
              label={vibe}
              selected={form.locationVibes.includes(vibe)}
              onClick={() => setForm({ ...form, locationVibes: toggleArray(form.locationVibes, vibe) })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function StepBudget({ form, setForm }: { form: PlanFormData; setForm: (f: PlanFormData) => void }) {
  return (
    <div className="flex flex-col gap-8">
      <StepHeading
        step={3}
        title="Budget & time?"
        subtitle="Set your spend per person and how long you have"
      />

      {/* Budget Slider */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-[#555] uppercase tracking-wider" style={{ fontFamily: "var(--font-satoshi)" }}>
            Budget per person
          </p>
          <span
            className="text-lg font-semibold"
            style={{ color: "#7B61FF", fontFamily: "var(--font-clash)" }}
          >
            ${form.budget}
          </span>
        </div>
        <div className="relative">
          <input
            type="range"
            min={20}
            max={300}
            step={10}
            value={form.budget}
            onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #7B61FF ${((form.budget - 20) / 280) * 100}%, #222 ${((form.budget - 20) / 280) * 100}%)`,
              accentColor: "#7B61FF",
            }}
          />
          <div className="flex justify-between mt-2">
            <span className="text-xs text-[#444]" style={{ fontFamily: "var(--font-satoshi)" }}>$20</span>
            <span className="text-xs text-[#444]" style={{ fontFamily: "var(--font-satoshi)" }}>$300</span>
          </div>
        </div>
      </div>

      {/* Duration */}
      <div>
        <p className="text-xs text-[#555] uppercase tracking-wider mb-3" style={{ fontFamily: "var(--font-satoshi)" }}>
          How long?
        </p>
        <div className="flex flex-wrap gap-2">
          {DURATION_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              selected={form.duration === opt.value}
              onClick={() => setForm({ ...form, duration: opt.value })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function StepPreferences({ form, setForm }: { form: PlanFormData; setForm: (f: PlanFormData) => void }) {
  return (
    <div className="flex flex-col gap-8">
      <StepHeading
        step={4}
        title="What are you into?"
        subtitle="Pick as many as you like — mix and match"
      />

      <div>
        <p className="text-xs text-[#555] uppercase tracking-wider mb-3" style={{ fontFamily: "var(--font-satoshi)" }}>
          Food
        </p>
        <div className="flex flex-wrap gap-2">
          {FOOD_OPTIONS.map((opt) => (
            <Chip
              key={opt}
              label={opt}
              selected={form.foodPrefs.includes(opt)}
              onClick={() => setForm({ ...form, foodPrefs: toggleArray(form.foodPrefs, opt) })}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-[#555] uppercase tracking-wider mb-3" style={{ fontFamily: "var(--font-satoshi)" }}>
          Activities
        </p>
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_OPTIONS.map((opt) => (
            <Chip
              key={opt}
              label={opt}
              selected={form.activityPrefs.includes(opt)}
              onClick={() => setForm({ ...form, activityPrefs: toggleArray(form.activityPrefs, opt) })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function StepSummary({
  form,
  onRandomize,
}: {
  form: PlanFormData
  onRandomize: () => void
}) {
  const groupLabel = GROUP_OPTIONS.find((g) => g.value === form.groupType)?.label ?? form.groupType
  const durationLabel = DURATION_OPTIONS.find((d) => d.value === form.duration)?.label ?? form.duration

  return (
    <div className="flex flex-col gap-6">
      <StepHeading
        step={5}
        title="Your plan brief"
        subtitle="Looks good? Let's build it."
      />

      <div
        className="rounded-2xl border border-[#1e1e1e] overflow-hidden"
        style={{ background: "#111" }}
      >
        <SummaryRow label="Group" value={groupLabel} />
        <SummaryRow
          label="Location"
          value={[form.city, ...form.locationVibes].filter(Boolean).join(" · ")}
        />
        <SummaryRow label="Budget" value={`$${form.budget} per person`} />
        <SummaryRow label="Duration" value={durationLabel} />
        <SummaryRow
          label="Food"
          value={form.foodPrefs.join(", ")}
        />
        <SummaryRow
          label="Activities"
          value={form.activityPrefs.join(", ")}
        />
      </div>

      <button
        type="button"
        onClick={onRandomize}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-[#2a2a2a] text-sm text-[#888] hover:text-white hover:border-[#444] transition-all"
        style={{ fontFamily: "var(--font-satoshi)" }}
      >
        <Shuffle size={16} />
        Randomize instead
      </button>
    </div>
  )
}

function StepHeading({ step, title, subtitle }: { step: number; title: string; subtitle: string }) {
  return (
    <div className="mb-2">
      <p
        className="text-xs font-medium uppercase tracking-wider mb-2"
        style={{ color: "#7B61FF", fontFamily: "var(--font-satoshi)" }}
      >
        Step {step} of {TOTAL_STEPS}
      </p>
      <h2
        className="text-2xl md:text-3xl font-semibold text-white mb-1"
        style={{ fontFamily: "var(--font-clash)" }}
      >
        {title}
      </h2>
      <p className="text-[#666] text-sm" style={{ fontFamily: "var(--font-satoshi)" }}>
        {subtitle}
      </p>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NewPlanPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<PlanFormData>(EMPTY_FORM)
  const [building, setBuilding] = useState(false)

  const advance = () => {
    if (step < TOTAL_STEPS) setStep((s) => s + 1)
  }

  const back = () => {
    if (step > 1) setStep((s) => s - 1)
    else router.push("/dashboard")
  }

  const handleRandomize = () => {
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]
    const pickN = <T,>(arr: T[], n: number): T[] => [...arr].sort(() => Math.random() - 0.5).slice(0, n)
    setForm({
      groupType: pick(GROUP_OPTIONS).value,
      city: pick(["New York", "Los Angeles", "Chicago", "Miami", "Austin"]),
      locationVibes: pickN(LOCATION_VIBES, 2),
      budget: pick([40, 60, 80, 100, 150, 200]),
      duration: pick(DURATION_OPTIONS).value,
      foodPrefs: pickN(FOOD_OPTIONS, 3),
      activityPrefs: pickN(ACTIVITY_OPTIONS, 3),
    })
  }

  const handleBuild = async () => {
    setBuilding(true)
    // AI generation wired up in next step — navigate to dashboard for now
    await new Promise((r) => setTimeout(r, 800))
    router.push("/dashboard")
  }

  const progress = (step / TOTAL_STEPS) * 100

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0A0A0A]/90 backdrop-blur-md border-b border-[#1a1a1a] px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-4">
          <button
            onClick={back}
            className="flex items-center justify-center w-9 h-9 rounded-full border border-[#222] text-[#888] hover:text-white hover:border-[#444] transition-all flex-shrink-0"
          >
            <ArrowLeft size={16} />
          </button>

          <div className="flex-1">
            {/* Progress bar */}
            <div className="h-1 rounded-full bg-[#1a1a1a] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: "linear-gradient(90deg, #7B61FF, #9B85FF)" }}
              />
            </div>
          </div>

          <span
            className="text-xs text-[#555] flex-shrink-0"
            style={{ fontFamily: "var(--font-satoshi)" }}
          >
            {step} / {TOTAL_STEPS}
          </span>
        </div>
      </header>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-8 pb-32">
          {step === 1 && <StepWho form={form} setForm={setForm} />}
          {step === 2 && <StepLocation form={form} setForm={setForm} />}
          {step === 3 && <StepBudget form={form} setForm={setForm} />}
          {step === 4 && <StepPreferences form={form} setForm={setForm} />}
          {step === 5 && <StepSummary form={form} onRandomize={handleRandomize} />}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/95 to-transparent pt-8 pb-6 px-4">
        <div className="max-w-lg mx-auto">
          {step < TOTAL_STEPS ? (
            <button
              onClick={advance}
              disabled={!canAdvance(step, form)}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-medium text-white transition-all"
              style={{
                fontFamily: "var(--font-satoshi)",
                backgroundColor: canAdvance(step, form) ? "#7B61FF" : "#1a1a1a",
                color: canAdvance(step, form) ? "#fff" : "#444",
                boxShadow: canAdvance(step, form) ? "0 0 30px rgba(123,97,255,0.3)" : "none",
                cursor: canAdvance(step, form) ? "pointer" : "not-allowed",
              }}
            >
              Continue
              <ArrowRight size={18} />
            </button>
          ) : (
            <button
              onClick={handleBuild}
              disabled={building}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-medium text-white transition-all"
              style={{
                fontFamily: "var(--font-satoshi)",
                backgroundColor: building ? "#5445cc" : "#7B61FF",
                boxShadow: "0 0 30px rgba(123,97,255,0.35)",
              }}
            >
              {building ? (
                <>
                  <span
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                  />
                  Building your plan…
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Build my plan with AI
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
