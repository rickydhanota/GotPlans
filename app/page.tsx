"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import Link from "next/link"
import {
  ArrowLeft, ArrowRight, Sparkles, Check,
  Users, UtensilsCrossed, Wallet, Music, MapPin, Pencil,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type StepId =
  | "group" | "location" | "eat" | "cuisines" | "budget"
  | "events" | "eventTypes" | "eventDetails" | "summary"

interface CitySuggestion {
  full: string
  main: string
  secondary: string
  placeId: string
}

interface Answers {
  groupSize: string
  city: string
  eat: "yes" | "no" | ""
  cuisines: string[]
  budget: number
  events: "yes" | "no" | ""
  eventTypes: string[]
  /** Per-type follow-up specifics, e.g. { sports: "Warriors", music: "indie rock" } */
  eventDetails: Record<string, string>
}

const INITIAL: Answers = {
  groupSize: "", city: "", eat: "", cuisines: [], budget: 80,
  events: "", eventTypes: [], eventDetails: {},
}

// ─── Event details copy + city → suggested specifics ─────────────────────────

interface EventDetailMeta {
  prompt: string
  placeholder: string
}

// Vibe-focused prompts — we don't ask users to name specific venues, teams,
// or artists. Finding the right spot is the app's job; we just need the mood.
const EVENT_DETAIL_META: Record<string, EventDetailMeta> = {
  music: {
    prompt: "What kind of music or vibe?",
    placeholder: "e.g. intimate jazz, high-energy rock, chill acoustic",
  },
  comedy: {
    prompt: "What's the comedy mood?",
    placeholder: "e.g. edgy stand-up, fun improv, observational",
  },
  theater: {
    prompt: "What kind of show?",
    placeholder: "e.g. intense drama, fun musical, experimental",
  },
  sports: {
    prompt: "What kind of sport or atmosphere?",
    placeholder: "e.g. playoff basketball, casual baseball, family game",
  },
  movies: {
    prompt: "What kind of movie night?",
    placeholder: "e.g. blockbuster, indie, classic, drive-in",
  },
  festivals: {
    prompt: "What kind of festival?",
    placeholder: "e.g. outdoor music, food-focused, art and design",
  },
  nightlife: {
    prompt: "What scene are you going for?",
    placeholder: "e.g. lively dance floor, chill lounge, intimate cocktails",
  },
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const GROUP_OPTIONS = [
  { value: "solo", label: "Just me", emoji: "🙋" },
  { value: "date", label: "Date night", emoji: "💑", subtitle: "2 people" },
  { value: "small", label: "Friends", emoji: "👫", subtitle: "3 – 5 people" },
  { value: "big", label: "Big group", emoji: "🎉", subtitle: "6+ people" },
  { value: "family", label: "Family", emoji: "👨‍👩‍👧" },
]

const CUISINES = [
  "Italian", "Japanese", "Mexican", "Indian", "Chinese", "Thai",
  "Korean", "Steakhouse", "Mediterranean", "BBQ", "Seafood",
  "Healthy", "Casual", "Wine bar", "Cocktail bar",
]

const EVENT_TYPES = [
  { value: "music", label: "Live music", emoji: "🎵" },
  { value: "comedy", label: "Comedy", emoji: "🎤" },
  { value: "theater", label: "Theater & shows", emoji: "🎭" },
  { value: "nightlife", label: "Nightlife", emoji: "🪩" },
  { value: "sports", label: "Sports", emoji: "🏀" },
  { value: "festivals", label: "Festivals", emoji: "🎪" },
  { value: "movies", label: "Movies", emoji: "🎬" },
]

// ─── Logic ────────────────────────────────────────────────────────────────────

function getActiveSteps(a: Answers): StepId[] {
  // Location moved to step 2 — it shapes everything after (suggestions, search radius, etc.)
  const s: StepId[] = ["group", "location", "eat"]
  if (a.eat === "yes") s.push("cuisines")
  s.push("budget", "events")
  if (a.events === "yes") {
    s.push("eventTypes")
    if (a.eventTypes.length > 0) s.push("eventDetails")
  }
  s.push("summary")
  return s
}

function canAdvance(step: StepId, a: Answers): boolean {
  switch (step) {
    case "group": return a.groupSize !== ""
    case "location": return a.city.trim().length > 0
    case "eat": return a.eat !== ""
    case "cuisines": return a.cuisines.length > 0
    case "budget": return true
    case "events": return a.events !== ""
    case "eventTypes": return a.eventTypes.length > 0
    case "eventDetails": return true  // optional — user can skip
    case "summary": return true
  }
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <h1
        className="text-[34px] leading-[1.1] font-semibold text-white mb-3 tracking-tight"
        style={{ fontFamily: "var(--font-clash)" }}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="text-[#888] text-base leading-relaxed" style={{ fontFamily: "var(--font-satoshi)" }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}

function BigChoice({
  label, subtitle, emoji, selected, onClick,
}: {
  label: string; subtitle?: string; emoji?: string
  selected: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border text-left transition-all active:scale-[0.98]"
      style={{
        fontFamily: "var(--font-satoshi)",
        backgroundColor: selected ? "rgba(123,97,255,0.14)" : "#14111E",
        borderColor: selected ? "#7B61FF" : "#262135",
        boxShadow: selected ? "0 0 24px rgba(123,97,255,0.25)" : "none",
      }}
    >
      {emoji && <span className="text-3xl flex-shrink-0">{emoji}</span>}
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold text-white">{label}</div>
        {subtitle && <div className="text-sm text-[#888] mt-0.5">{subtitle}</div>}
      </div>
      {selected && (
        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#7B61FF" }}>
          <Check size={14} className="text-white" strokeWidth={3} />
        </div>
      )}
    </button>
  )
}

function Pill({
  label, emoji, selected, onClick,
}: { label: string; emoji?: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-3 rounded-full text-sm font-medium border transition-all active:scale-95"
      style={{
        fontFamily: "var(--font-satoshi)",
        backgroundColor: selected ? "#7B61FF" : "#14111E",
        borderColor: selected ? "#7B61FF" : "#322C48",
        color: selected ? "#fff" : "#bbb",
        boxShadow: selected ? "0 0 16px rgba(123,97,255,0.35)" : "none",
      }}
    >
      {emoji && <span>{emoji}</span>}
      {label}
    </button>
  )
}

function AddCustomChip({
  onAdd,
  placeholder = "Add your own…",
}: {
  onAdd: (value: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")

  const submit = () => {
    const v = value.trim()
    if (v) onAdd(v)
    setValue("")
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-3 rounded-full text-sm font-medium border border-dashed transition-all active:scale-95"
        style={{
          fontFamily: "var(--font-satoshi)",
          backgroundColor: "transparent",
          borderColor: "#333",
          color: "#888",
        }}
      >
        <span className="text-base leading-none">+</span>
        Other
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 pl-4 pr-2 py-1.5 rounded-full border bg-[#14111E]" style={{ borderColor: "#7B61FF" }}>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") submit()
          if (e.key === "Escape") { setOpen(false); setValue("") }
        }}
        onBlur={submit}
        placeholder={placeholder}
        className="bg-transparent outline-none text-sm text-white placeholder:text-[#555] w-32"
        style={{ fontFamily: "var(--font-satoshi)" }}
      />
      <button
        type="button"
        onMouseDown={e => { e.preventDefault(); submit() }}
        className="w-7 h-7 rounded-full flex items-center justify-center text-white"
        style={{ backgroundColor: "#7B61FF" }}
      >
        <Check size={14} strokeWidth={3} />
      </button>
    </div>
  )
}

function YesNoTiles({
  value, onChange, yesLabel = "Yes", noLabel = "No, skip",
}: {
  value: "yes" | "no" | ""
  onChange: (v: "yes" | "no") => void
  yesLabel?: string; noLabel?: string
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {(["yes", "no"] as const).map(v => {
        const selected = value === v
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className="flex flex-col items-center justify-center gap-2 px-4 py-8 rounded-2xl border transition-all active:scale-[0.98]"
            style={{
              fontFamily: "var(--font-satoshi)",
              backgroundColor: selected ? "rgba(123,97,255,0.14)" : "#14111E",
              borderColor: selected ? "#7B61FF" : "#1f1f1f",
              boxShadow: selected ? "0 0 24px rgba(123,97,255,0.2)" : "none",
            }}
          >
            <span className="text-3xl">{v === "yes" ? "✨" : "⏭️"}</span>
            <span className="text-base font-semibold text-white">{v === "yes" ? yesLabel : noLabel}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [answers, setAnswers] = useState<Answers>(INITIAL)
  const [stepIdx, setStepIdx] = useState(0)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [buildMsgIdx, setBuildMsgIdx] = useState(0)

  // City autocomplete state
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([])
  const [showCityDropdown, setShowCityDropdown] = useState(false)
  const [loadingCities, setLoadingCities] = useState(false)
  /** Whether the current city value came from a tapped suggestion (suppress re-fetch). */
  const [cityFromPick, setCityFromPick] = useState(false)
  const activeSteps = getActiveSteps(answers)
  const safeIdx = Math.min(stepIdx, activeSteps.length - 1)
  const currentStep = activeSteps[safeIdx]
  const isLast = safeIdx === activeSteps.length - 1
  const progress = ((safeIdx + 1) / activeSteps.length) * 100

  // Restore in-progress answers (e.g. after sign-in redirect).
  // If everything is filled, jump to the summary so user can hit Build immediately.
  useEffect(() => {
    const saved = localStorage.getItem("gotplans:answers")
    if (!saved) return
    try {
      const restored = JSON.parse(saved) as Answers
      setAnswers(restored)
      const steps = getActiveSteps(restored)
      const allFilled = steps.every(s => s === "summary" || canAdvance(s, restored))
      if (allFilled) setStepIdx(steps.length - 1)
    } catch {}
  }, [])

  // Rotate build messages while generating
  useEffect(() => {
    if (!building) return
    const interval = setInterval(() => setBuildMsgIdx(i => i + 1), 1800)
    return () => clearInterval(interval)
  }, [building])

  // Debounced city autocomplete: fires while user is on the location step
  useEffect(() => {
    if (cityFromPick) {
      // User just tapped a suggestion — don't immediately re-fetch the same value
      setCitySuggestions([])
      return
    }
    const q = answers.city.trim()
    if (q.length < 2) {
      setCitySuggestions([])
      setLoadingCities(false)
      return
    }

    setLoadingCities(true)
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/places/autocomplete?q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal }
        )
        if (!res.ok) throw new Error()
        const data = (await res.json()) as { suggestions: CitySuggestion[] }
        setCitySuggestions(data.suggestions ?? [])
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          setCitySuggestions([])
        }
      } finally {
        setLoadingCities(false)
      }
    }, 250)

    return () => {
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [answers.city, cityFromPick])

  const update = (patch: Partial<Answers>) => setAnswers(a => ({ ...a, ...patch }))

  const advance = () => {
    if (!isLast) setStepIdx(i => i + 1)
  }
  const back = () => {
    if (safeIdx > 0) setStepIdx(i => i - 1)
  }
  const jumpTo = (id: StepId) => {
    const idx = activeSteps.indexOf(id)
    if (idx >= 0) setStepIdx(idx)
  }

  const onBuild = async () => {
    setError(null)
    if (!session) {
      // Persist answers so they survive the sign-in redirect, then bounce to auth.
      localStorage.setItem("gotplans:answers", JSON.stringify(answers))
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent("/")}`)
      return
    }

    setBuilding(true)
    try {
      const res = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Could not build plan")
      }
      const { id } = await res.json()
      localStorage.removeItem("gotplans:answers")
      router.push(`/plan/${id}`)
    } catch (err) {
      setBuilding(false)
      setError(err instanceof Error ? err.message : "Something went wrong")
    }
  }

  const BUILD_MESSAGES = [
    "Curating your plan…",
    "Finding the perfect spots…",
    "Sequencing the night…",
    "Adding the finishing touches…",
  ]

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0814]">
      {/* Header */}
      <header className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center">
          {safeIdx > 0 ? (
            <button
              onClick={back}
              className="w-10 h-10 rounded-full flex items-center justify-center border border-[#322C48] text-[#aaa] hover:text-white hover:border-[#444] active:scale-90 transition-all"
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <Link href="/about">
              <span
                className="text-xl font-semibold tracking-tight text-white"
                style={{ fontFamily: "var(--font-clash)" }}
              >
                Got<span style={{ color: "#7B61FF" }}>Plans</span>
              </span>
            </Link>
          )}
        </div>

        {status === "authenticated" ? (
          <Link
            href="/dashboard"
            className="text-sm text-[#888] hover:text-white transition-colors px-3 py-1.5"
            style={{ fontFamily: "var(--font-satoshi)" }}
          >
            My Plans
          </Link>
        ) : (
          <Link
            href="/auth/signin"
            className="text-sm text-[#888] hover:text-white transition-colors px-3 py-1.5"
            style={{ fontFamily: "var(--font-satoshi)" }}
          >
            Sign in
          </Link>
        )}
      </header>

      {/* Progress bar */}
      <div className="px-4 mb-4">
        <div className="h-1 rounded-full bg-[#1a1a1a] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%`, background: "linear-gradient(90deg, #7B61FF, #9B85FF)" }}
          />
        </div>
      </div>

      {/* Step content */}
      <main className="flex-1 overflow-y-auto px-5 pt-6 pb-40">
        <div className="max-w-md mx-auto">
          {currentStep ==="group" && (
            <>
              <Heading title="How many?" subtitle="Who's coming on this plan?" />
              <div className="flex flex-col gap-3">
                {GROUP_OPTIONS.map(o => (
                  <BigChoice
                    key={o.value}
                    label={o.label}
                    subtitle={o.subtitle}
                    emoji={o.emoji}
                    selected={answers.groupSize === o.value}
                    onClick={() => { update({ groupSize: o.value }); setTimeout(advance, 180) }}
                  />
                ))}
              </div>
            </>
          )}

          {currentStep ==="eat" && (
            <>
              <Heading title="Hungry?" subtitle="We can plan meals or skip food entirely." />
              <YesNoTiles
                value={answers.eat}
                onChange={v => { update({ eat: v }); setTimeout(advance, 180) }}
                yesLabel="Restaurants"
                noLabel="Skip food"
              />
            </>
          )}

          {currentStep ==="cuisines" && (
            <>
              <Heading title="What sounds good?" subtitle="Pick a cuisine, or type a specific dish you're craving." />
              <div className="flex flex-wrap gap-2">
                {[...CUISINES, ...answers.cuisines.filter(c => !CUISINES.includes(c))].map(c => (
                  <Pill
                    key={c}
                    label={c}
                    selected={answers.cuisines.includes(c)}
                    onClick={() => update({ cuisines: toggle(answers.cuisines, c) })}
                  />
                ))}
                <AddCustomChip
                  placeholder="e.g. Butter chicken"
                  onAdd={v => {
                    if (!answers.cuisines.includes(v)) {
                      update({ cuisines: [...answers.cuisines, v] })
                    }
                  }}
                />
              </div>
            </>
          )}

          {currentStep ==="budget" && (
            <>
              <Heading title="Your budget?" subtitle="Per person — food, drinks, and activities combined." />
              <div className="rounded-2xl bg-[#14111E] border border-[#262135] p-6">
                <div className="text-center mb-6">
                  <div
                    className="text-6xl font-semibold tracking-tight"
                    style={{ fontFamily: "var(--font-clash)", color: "#7B61FF" }}
                  >
                    ${answers.budget}
                  </div>
                  <div className="text-sm text-[#666] mt-1" style={{ fontFamily: "var(--font-satoshi)" }}>
                    per person
                  </div>
                </div>
                <input
                  type="range"
                  min={20}
                  max={300}
                  step={10}
                  value={answers.budget}
                  onChange={e => update({ budget: Number(e.target.value) })}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #7B61FF ${((answers.budget - 20) / 280) * 100}%, #222 ${((answers.budget - 20) / 280) * 100}%)`,
                    accentColor: "#7B61FF",
                  }}
                />
                <div className="flex justify-between mt-3 text-xs text-[#555]" style={{ fontFamily: "var(--font-satoshi)" }}>
                  <span>$20</span>
                  <span>$300+</span>
                </div>
              </div>
            </>
          )}

          {currentStep ==="events" && (
            <>
              <Heading title="Any events?" subtitle="Live music, comedy, shows, sports — that kind of thing." />
              <YesNoTiles
                value={answers.events}
                onChange={v => { update({ events: v }); setTimeout(advance, 180) }}
                yesLabel="Yes, find some"
                noLabel="Skip events"
              />
            </>
          )}

          {currentStep ==="eventTypes" && (
            <>
              <Heading title="What kind?" subtitle="Pick your favorites." />
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map(e => (
                  <Pill
                    key={e.value}
                    label={e.label}
                    emoji={e.emoji}
                    selected={answers.eventTypes.includes(e.value)}
                    onClick={() => update({ eventTypes: toggle(answers.eventTypes, e.value) })}
                  />
                ))}
                {answers.eventTypes
                  .filter(t => !EVENT_TYPES.find(e => e.value === t))
                  .map(t => (
                    <Pill
                      key={t}
                      label={t}
                      selected={true}
                      onClick={() => update({ eventTypes: toggle(answers.eventTypes, t) })}
                    />
                  ))}
                <AddCustomChip
                  placeholder="e.g. Trivia night"
                  onAdd={v => {
                    if (!answers.eventTypes.includes(v)) {
                      update({ eventTypes: [...answers.eventTypes, v] })
                    }
                  }}
                />
              </div>
            </>
          )}

          {currentStep ==="eventDetails" && (
            <>
              <Heading
                title="What's the vibe?"
                subtitle="Optional — describe the mood you're going for. We'll find the right spot."
              />
              <div className="flex flex-col gap-5">
                {answers.eventTypes.map(et => {
                  const meta = EVENT_DETAIL_META[et] ?? { prompt: `What's the mood for ${et}?`, placeholder: "Anything in mind?" }
                  const label = EVENT_TYPES.find(e => e.value === et)?.label ?? et
                  const value = answers.eventDetails[et] ?? ""
                  return (
                    <div key={et} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-sm" style={{ fontFamily: "var(--font-satoshi)" }}>
                        <span className="text-white font-medium">{label}</span>
                        <span className="text-[#555]">·</span>
                        <span className="text-[#666]">{meta.prompt}</span>
                      </div>
                      <input
                        type="text"
                        value={value}
                        onChange={e => update({ eventDetails: { ...answers.eventDetails, [et]: e.target.value } })}
                        placeholder={meta.placeholder}
                        className="w-full px-4 py-3 rounded-xl border border-[#262135] bg-[#14111E] text-white text-sm placeholder:text-[#444] focus:outline-none focus:border-[#7B61FF]/60 transition-colors"
                        style={{ fontFamily: "var(--font-satoshi)" }}
                      />
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {currentStep ==="location" && (
            <>
              <Heading title="Where are you?" subtitle="Start typing your city — pick a suggestion, or just keep typing." />
              <div className="relative">
                <input
                  autoFocus
                  type="text"
                  value={answers.city}
                  onChange={e => {
                    update({ city: e.target.value })
                    setCityFromPick(false)
                    setShowCityDropdown(true)
                  }}
                  onFocus={() => setShowCityDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCityDropdown(false), 150)}
                  placeholder="e.g. San Francisco"
                  className="w-full px-5 py-4 rounded-2xl border border-[#262135] bg-[#14111E] text-white text-lg placeholder:text-[#444] focus:outline-none focus:border-[#7B61FF]/60 transition-colors"
                  style={{ fontFamily: "var(--font-satoshi)" }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && answers.city.trim()) {
                      setShowCityDropdown(false)
                      advance()
                    }
                    if (e.key === "Escape") setShowCityDropdown(false)
                  }}
                  autoComplete="off"
                />

                {showCityDropdown && answers.city.trim().length >= 2 && !cityFromPick && (
                  <div
                    className="absolute left-0 right-0 top-full mt-2 rounded-2xl border border-[#262135] bg-[#0f0f0f] overflow-hidden shadow-2xl z-10"
                    style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}
                  >
                    {loadingCities && citySuggestions.length === 0 && (
                      <div
                        className="px-5 py-4 text-sm text-[#666]"
                        style={{ fontFamily: "var(--font-satoshi)" }}
                      >
                        Searching…
                      </div>
                    )}
                    {!loadingCities && citySuggestions.length === 0 && (
                      <div
                        className="px-5 py-4 text-sm text-[#666]"
                        style={{ fontFamily: "var(--font-satoshi)" }}
                      >
                        No match — keep typing or hit Continue to use what you have.
                      </div>
                    )}
                    {citySuggestions.map((s, idx) => (
                      <button
                        key={s.placeId}
                        type="button"
                        // onMouseDown fires before input's onBlur, so the click actually registers
                        onMouseDown={e => {
                          e.preventDefault()
                          update({ city: s.full })
                          setCityFromPick(true)
                          setShowCityDropdown(false)
                          setCitySuggestions([])
                        }}
                        className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[#1a1a1a] active:bg-[#222]"
                        style={{
                          borderTop: idx > 0 ? "1px solid #1a1a1a" : undefined,
                        }}
                      >
                        <MapPin size={16} className="text-[#9B85FF] flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-sm text-white font-medium truncate"
                            style={{ fontFamily: "var(--font-satoshi)" }}
                          >
                            {s.main}
                          </div>
                          {s.secondary && (
                            <div
                              className="text-xs text-[#666] truncate"
                              style={{ fontFamily: "var(--font-satoshi)" }}
                            >
                              {s.secondary}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {currentStep ==="summary" && (
            <>
              <Heading title="All set ✨" subtitle="Here's your plan brief. Tap to edit anything." />
              <div className="flex flex-col gap-2">
                <SummaryRow icon={<Users size={18} />} label="Group" value={GROUP_OPTIONS.find(g => g.value === answers.groupSize)?.label ?? "—"} onEdit={() => jumpTo("group")} />
                <SummaryRow icon={<UtensilsCrossed size={18} />} label="Food" value={answers.eat === "yes" ? (answers.cuisines.join(", ") || "Any") : "Skip"} onEdit={() => jumpTo("eat")} />
                <SummaryRow icon={<Wallet size={18} />} label="Budget" value={`$${answers.budget} per person`} onEdit={() => jumpTo("budget")} />
                <SummaryRow icon={<Music size={18} />} label="Events" value={answers.events === "yes" ? (
                  answers.eventTypes.map(v => {
                    const label = EVENT_TYPES.find(e => e.value === v)?.label ?? v
                    const detail = answers.eventDetails[v]?.trim()
                    return detail ? `${label} (${detail})` : label
                  }).join(", ") || "Any"
                ) : "Skip"} onEdit={() => jumpTo("events")} />
                <SummaryRow icon={<MapPin size={18} />} label="Location" value={answers.city || "—"} onEdit={() => jumpTo("location")} />
              </div>
            </>
          )}
        </div>
      </main>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 px-5 pb-safe pt-10 pointer-events-none bg-gradient-to-t from-[#0B0814] via-[#0B0814]/95 to-transparent">
        <div className="max-w-md mx-auto pointer-events-auto">
          {!isLast ? (
            <button
              onClick={advance}
              disabled={!canAdvance(currentStep, answers)}
              className="w-full flex items-center justify-center gap-2 h-14 rounded-2xl text-base font-medium transition-all active:scale-[0.98]"
              style={{
                fontFamily: "var(--font-satoshi)",
                backgroundColor: canAdvance(currentStep, answers) ? "#7B61FF" : "#1a1a1a",
                color: canAdvance(currentStep, answers) ? "#fff" : "#444",
                boxShadow: canAdvance(currentStep, answers) ? "0 0 30px rgba(123,97,255,0.3)" : "none",
              }}
            >
              Continue
              <ArrowRight size={18} />
            </button>
          ) : (
            <button
              onClick={onBuild}
              disabled={building}
              className="w-full flex items-center justify-center gap-2 h-14 rounded-2xl text-base font-medium text-white transition-all active:scale-[0.98]"
              style={{
                fontFamily: "var(--font-satoshi)",
                // Headline CTA — gradient distinguishes it from per-step Continue
                background: building
                  ? "linear-gradient(135deg, #5445cc 0%, #8B6BBB 100%)"
                  : "linear-gradient(135deg, #7B61FF 0%, #B57DFF 50%, #FF6B9D 100%)",
                boxShadow: "0 0 32px rgba(181,125,255,0.45), 0 0 60px rgba(255,107,157,0.18)",
              }}
            >
              <Sparkles size={18} />
              Build my plan
            </button>
          )}

          {error && !building && (
            <div
              className="mt-3 px-4 py-3 rounded-xl text-sm text-red-300 border border-red-900 bg-red-950/40"
              style={{ fontFamily: "var(--font-satoshi)" }}
            >
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Building overlay */}
      {building && (
        <div className="fixed inset-0 z-50 bg-[#0B0814] flex flex-col items-center justify-center px-6">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 50% 30%, rgba(123,97,255,0.18) 0%, transparent 60%), radial-gradient(circle at 60% 70%, rgba(255,107,157,0.12) 0%, transparent 60%)",
            }}
          />
          <div className="relative flex flex-col items-center text-center max-w-sm">
            <div className="relative mb-8">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #7B61FF 0%, #B57DFF 50%, #FF6B9D 100%)",
                  boxShadow: "0 0 60px rgba(181,125,255,0.55), 0 0 100px rgba(255,107,157,0.25)",
                }}
              >
                <Sparkles size={32} className="text-white animate-pulse" />
              </div>
              <span className="absolute -inset-2 rounded-3xl border-2 border-[#7B61FF]/30 animate-ping" />
            </div>
            <h2
              className="text-3xl font-semibold text-white mb-3 tracking-tight"
              style={{ fontFamily: "var(--font-clash)" }}
            >
              {BUILD_MESSAGES[buildMsgIdx % BUILD_MESSAGES.length]}
            </h2>
            <p
              className="text-[#666] text-sm"
              style={{ fontFamily: "var(--font-satoshi)" }}
            >
              This usually takes 5–15 seconds.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryRow({
  icon, label, value, onEdit,
}: {
  icon: React.ReactNode; label: string; value: string; onEdit: () => void
}) {
  return (
    <button
      onClick={onEdit}
      className="w-full flex items-center gap-3 p-4 rounded-2xl border border-[#262135] bg-[#14111E] hover:border-[#2a2a2a] active:scale-[0.99] transition-all text-left"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: "rgba(123,97,255,0.1)", color: "#9B85FF" }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs uppercase tracking-wider text-[#555] mb-0.5" style={{ fontFamily: "var(--font-satoshi)" }}>
          {label}
        </div>
        <div className="text-sm text-white truncate" style={{ fontFamily: "var(--font-satoshi)" }}>
          {value}
        </div>
      </div>
      <Pencil size={14} className="text-[#444] flex-shrink-0" />
    </button>
  )
}
