"use client"

import { useEffect, useRef, useState } from "react"
import {
  UtensilsCrossed, Music, Wine, Camera, Star, ChevronDown, ChevronLeft, ChevronRight,
  ExternalLink, MapPin, Check, RefreshCw,
} from "lucide-react"

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
  imageUrls?: string[]
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
  neighborhood?: string
  options: PlanOption[]
  seenIds?: string[]
  /** New: array of locked option indices. Lock as many as you like. */
  lockedIdxs?: number[]
  /** Legacy single-lock field. Read for back-compat; never written. */
  lockedIdx?: number | null
}

function readLockedSet(slot: Pick<PlanSlot, "lockedIdxs" | "lockedIdx">): Set<number> {
  if (slot.lockedIdxs && slot.lockedIdxs.length > 0) return new Set(slot.lockedIdxs)
  if (slot.lockedIdx != null) return new Set([slot.lockedIdx])
  return new Set()
}

const TYPE_ICONS = {
  restaurant: UtensilsCrossed,
  drinks: Wine,
  event: Music,
  activity: Camera,
}

const TYPE_LABELS = {
  restaurant: "Eat",
  drinks: "Drinks",
  event: "Event",
  activity: "Activity",
}

// Per-type accent colors. Used for icon background, type label text, and
// small visual details so a 4-stop plan reads as visually varied rather than
// monochromatic violet. Primary actions (lock, CTAs) still use brand violet.
const TYPE_COLORS = {
  restaurant: { accent: "#FF8E5A", soft: "rgba(255,142,90,0.14)" },
  drinks: { accent: "#00D9C0", soft: "rgba(0,217,192,0.14)" },
  event: { accent: "#C77DFF", soft: "rgba(199,125,255,0.14)" },
  activity: { accent: "#FFB547", soft: "rgba(255,181,71,0.14)" },
} as const

function priceDots(level?: number): string {
  if (level == null) return ""
  return "$".repeat(Math.max(1, Math.min(4, level)))
}

function formatEventDate(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  )
}

export default function PlanSlotCard({
  planId,
  slotIdx,
  slot: initialSlot,
}: {
  planId: string
  slotIdx: number
  slot: PlanSlot
}) {
  const [slot, setSlot] = useState<PlanSlot>(initialSlot)
  const lockedSet = readLockedSet(slot)
  // Displayed option — defaults to first locked option if any, else 0.
  const initialSelected =
    lockedSet.size > 0 ? Math.min(...lockedSet) : 0
  const [selectedIdx, setSelectedIdx] = useState(initialSelected)
  const [expanded, setExpanded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [busyLock, setBusyLock] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const Icon = TYPE_ICONS[slot.type] ?? Camera
  const color = TYPE_COLORS[slot.type] ?? TYPE_COLORS.activity
  const display = slot.options[selectedIdx] ?? slot.options[0]
  const alternatives = slot.options
    .map((o, i) => ({ o, i }))
    .filter(({ i }) => i !== selectedIdx)
  const canRefresh = !!slot.keyword
  const allLocked = lockedSet.size >= slot.options.length && slot.options.length > 0
  const isDisplayLocked = lockedSet.has(selectedIdx)

  const handleToggleLock = async (idx: number) => {
    if (busyLock) return
    setError(null)
    setBusyLock(true)

    // Toggle the index in our locked set
    const next = new Set(lockedSet)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    const newLockedIdxs = [...next].sort((a, b) => a - b)

    // Optimistic update
    const prev = slot
    setSlot({ ...slot, lockedIdxs: newLockedIdxs, lockedIdx: null })

    try {
      const res = await fetch(`/api/plans/${planId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotIdx, lockedIdxs: newLockedIdxs }),
      })
      if (!res.ok) throw new Error("Could not save")
    } catch {
      setSlot(prev)
      setError("Could not save your pick. Try again.")
    } finally {
      setBusyLock(false)
    }
  }

  const handleRefresh = async () => {
    if (refreshing || !canRefresh || allLocked) return
    setError(null)
    setRefreshing(true)
    try {
      const res = await fetch(`/api/plans/${planId}/regenerate-slot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotIdx }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Refresh failed")
      const newSlot = data.slot as PlanSlot
      setSlot(newSlot)
      // After refresh, show the first locked option (now at index 0) if any,
      // otherwise the first fresh option.
      const newLockedSet = readLockedSet(newSlot)
      setSelectedIdx(newLockedSet.size > 0 ? Math.min(...newLockedSet) : 0)
      setExpanded(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed")
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div
      className="rounded-2xl border bg-[#14111E] overflow-hidden transition-colors"
      style={{
        // Subtle violet border when ANY option is locked (visual cue at the card level)
        borderColor: lockedSet.size > 0 ? "rgba(123,97,255,0.35)" : "#262135",
      }}
    >
      {/* Slot header */}
      <div className="px-5 pt-5 pb-3 flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: color.soft, color: color.accent }}
        >
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span
              className="text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: color.accent, fontFamily: "var(--font-satoshi)" }}
            >
              {TYPE_LABELS[slot.type]}
            </span>
            <span className="text-[10px] text-[#444]">·</span>
            <span className="text-[10px] text-[#666]" style={{ fontFamily: "var(--font-satoshi)" }}>
              {slot.time} · {slot.duration}
            </span>
          </div>
          <p className="text-sm text-[#bbb] leading-snug" style={{ fontFamily: "var(--font-satoshi)" }}>
            {slot.intent}
          </p>
        </div>
      </div>

      {/* Displayed option */}
      {display && (
        <OptionCard
          option={display}
          locked={isDisplayLocked}
          onToggleLock={() => handleToggleLock(selectedIdx)}
          busyLock={busyLock}
        />
      )}

      {/* Alternatives */}
      {alternatives.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-between px-5 py-3 border-t border-[#262135] text-sm text-[#888] hover:text-white hover:bg-[#1C1830] transition-colors"
          style={{ fontFamily: "var(--font-satoshi)" }}
        >
          <span>
            {expanded
              ? "Hide other options"
              : `View ${alternatives.length} other option${alternatives.length > 1 ? "s" : ""}`}
          </span>
          <ChevronDown
            size={16}
            className="transition-transform"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>
      )}

      {expanded && (
        <div className="border-t border-[#262135] bg-[#0F0D18]">
          {alternatives.map(({ o, i }) => (
            <AlternativeRow
              key={o.externalId ?? `${o.name}-${i}`}
              option={o}
              locked={lockedSet.has(i)}
              onSelect={() => {
                setSelectedIdx(i)
                setExpanded(false)
              }}
              onToggleLock={() => handleToggleLock(i)}
              busyLock={busyLock}
            />
          ))}
        </div>
      )}

      {/* Refresh — disabled when every option is locked (nothing to refresh) */}
      {canRefresh && (
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || allLocked}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 border-t border-[#262135] text-sm text-[#888] hover:text-white hover:bg-[#1C1830] transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#888] disabled:cursor-not-allowed"
          style={{ fontFamily: "var(--font-satoshi)" }}
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing
            ? "Finding new options…"
            : allLocked
            ? "All options locked"
            : lockedSet.size > 0
            ? `Refresh the other ${slot.options.length - lockedSet.size}`
            : "Show different options"}
        </button>
      )}

      {error && (
        <div
          className="px-5 py-3 border-t border-[#262135] text-xs text-red-300"
          style={{ fontFamily: "var(--font-satoshi)" }}
        >
          {error}
        </div>
      )}
    </div>
  )
}

// ─── Primary option card (with full actions + lock button) ───────────────────

function OptionCard({
  option,
  locked,
  onToggleLock,
  busyLock,
}: {
  option: PlanOption
  locked: boolean
  onToggleLock: () => void
  busyLock?: boolean
}) {
  if (!option) return null

  return (
    <div className="px-5 pb-5">
      <ImageCarousel
        images={option.imageUrls ?? (option.imageUrl ? [option.imageUrl] : [])}
        alt={option.name}
      />

      <div className="flex items-start justify-between gap-3 mb-2">
        <h3
          className="text-lg font-semibold text-white leading-tight flex-1 min-w-0"
          style={{ fontFamily: "var(--font-clash)" }}
        >
          {option.name}
        </h3>
        {option.estimatedCost != null && (
          <span
            className="text-sm font-semibold flex-shrink-0"
            style={{ color: "#7B61FF", fontFamily: "var(--font-satoshi)" }}
          >
            ${option.estimatedCost}
          </span>
        )}
      </div>

      <div
        className="flex items-center gap-3 flex-wrap mb-3 text-xs text-[#888]"
        style={{ fontFamily: "var(--font-satoshi)" }}
      >
        {option.rating != null && (
          <span className="inline-flex items-center gap-1">
            <Star size={12} className="text-yellow-500 fill-yellow-500" />
            {option.rating.toFixed(1)}
            {option.ratingCount != null && (
              <span className="text-[#555]">({option.ratingCount.toLocaleString()})</span>
            )}
          </span>
        )}
        {option.priceLevel != null && <span>{priceDots(option.priceLevel)}</span>}
        {option.eventDate && <span>{formatEventDate(option.eventDate)}</span>}
        {option.address && (
          <span className="inline-flex items-center gap-1 truncate max-w-full">
            <MapPin size={11} />
            <span className="truncate">{option.address}</span>
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onToggleLock}
          disabled={busyLock}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium border transition-all active:scale-[0.98] disabled:opacity-50"
          style={{
            fontFamily: "var(--font-satoshi)",
            backgroundColor: locked ? "#7B61FF" : "transparent",
            borderColor: "#7B61FF",
            color: locked ? "#fff" : "#9B85FF",
          }}
        >
          {locked ? <Check size={14} strokeWidth={3} /> : <Star size={14} />}
          {locked ? "Locked in" : "Lock this in"}
        </button>
        {option.actions.primary && (
          <a
            href={option.actions.primary.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all hover:opacity-90 active:scale-[0.98] border"
            style={{
              fontFamily: "var(--font-satoshi)",
              backgroundColor: "#262135",
              borderColor: "#222",
              color: "#fff",
            }}
          >
            {option.actions.primary.label}
            <ExternalLink size={13} />
          </a>
        )}
        {option.actions.directions && (
          <a
            href={option.actions.directions}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium border border-[#322C48] text-[#bbb] hover:text-white hover:border-[#444] transition-all"
            style={{ fontFamily: "var(--font-satoshi)" }}
          >
            <MapPin size={13} />
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Compact alternative row (in expanded list) ──────────────────────────────
//
// Two interactive areas: the row body (tap to bring this option to the top)
// and the star button (tap to toggle lock without switching the displayed
// option). Star uses onMouseDown so it fires before the outer onClick.

function AlternativeRow({
  option,
  locked,
  onSelect,
  onToggleLock,
  busyLock,
}: {
  option: PlanOption
  locked: boolean
  onSelect: () => void
  onToggleLock: () => void
  busyLock?: boolean
}) {
  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect()
      }}
      className="w-full px-5 py-4 border-t border-[#262135] flex items-start gap-3 cursor-pointer transition-colors hover:bg-[#1C1830]"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 mb-1">
          <h4
            className="text-base font-semibold text-white leading-tight flex-1 min-w-0"
            style={{ fontFamily: "var(--font-clash)" }}
          >
            {option.name}
          </h4>
          {option.estimatedCost != null && (
            <span
              className="text-sm font-semibold flex-shrink-0"
              style={{ color: "#7B61FF", fontFamily: "var(--font-satoshi)" }}
            >
              ${option.estimatedCost}
            </span>
          )}
        </div>
        <div
          className="flex items-center gap-3 flex-wrap text-xs text-[#888]"
          style={{ fontFamily: "var(--font-satoshi)" }}
        >
          {option.rating != null && (
            <span className="inline-flex items-center gap-1">
              <Star size={11} className="text-yellow-500 fill-yellow-500" />
              {option.rating.toFixed(1)}
              {option.ratingCount != null && (
                <span className="text-[#555]">({option.ratingCount.toLocaleString()})</span>
              )}
            </span>
          )}
          {option.priceLevel != null && <span>{priceDots(option.priceLevel)}</span>}
          {option.eventDate && <span>{formatEventDate(option.eventDate)}</span>}
        </div>
      </div>

      {/* Star toggle (lock) — onMouseDown so it fires before the row's click */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!busyLock) onToggleLock()
        }}
        disabled={busyLock}
        className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 disabled:opacity-50"
        style={{
          backgroundColor: locked ? "#7B61FF" : "transparent",
          border: `1px solid ${locked ? "#7B61FF" : "#2a2a2a"}`,
          color: locked ? "#fff" : "#888",
        }}
        aria-label={locked ? "Unlock this option" : "Lock this option"}
      >
        {locked ? <Check size={14} strokeWidth={3} /> : <Star size={14} />}
      </button>
    </div>
  )
}

// ─── Image carousel ──────────────────────────────────────────────────────────
//
// Click left/right buttons or swipe horizontally to flip through a venue's
// photos. Gracefully renders nothing when there are no images, and hides
// navigation controls when there's only one.

function ImageCarousel({ images, alt }: { images: string[]; alt: string }) {
  const [idx, setIdx] = useState(0)
  const touchStartX = useRef<number | null>(null)

  // Reset when the underlying set changes (e.g. after a slot refresh)
  useEffect(() => {
    setIdx(0)
  }, [images.join("|")])

  if (!images || images.length === 0) return null

  const count = images.length
  const safeIdx = Math.max(0, Math.min(idx, count - 1))
  const prev = () => setIdx((i) => (i - 1 + count) % count)
  const next = () => setIdx((i) => (i + 1) % count)

  return (
    <div
      className="relative rounded-xl overflow-hidden bg-[#0F0D18] mb-3 border border-[#262135] select-none"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current == null) return
        const dx = e.changedTouches[0].clientX - touchStartX.current
        touchStartX.current = null
        if (Math.abs(dx) < 40) return
        if (dx > 0) prev()
        else next()
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[safeIdx]}
        alt={`${alt} — photo ${safeIdx + 1}`}
        className="w-full h-44 object-cover transition-opacity"
        loading="lazy"
        draggable={false}
      />

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/75 active:scale-90 transition-all"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/75 active:scale-90 transition-all"
          >
            <ChevronRight size={18} />
          </button>

          {/* Indicator: dots for <=6, counter for more */}
          {count <= 6 ? (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-sm">
              {images.map((_, i) => (
                <span
                  key={i}
                  className="rounded-full transition-all"
                  style={{
                    width: i === safeIdx ? 18 : 6,
                    height: 6,
                    backgroundColor: i === safeIdx ? "#fff" : "rgba(255,255,255,0.45)",
                  }}
                />
              ))}
            </div>
          ) : (
            <div
              className="absolute bottom-2 right-2 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-sm text-xs font-medium text-white"
              style={{ fontFamily: "var(--font-satoshi)" }}
            >
              {safeIdx + 1} / {count}
            </div>
          )}
        </>
      )}
    </div>
  )
}
