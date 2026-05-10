"use client"

import { useState } from "react"
import {
  UtensilsCrossed, Music, Wine, Camera, Star, ChevronDown,
  ExternalLink, MapPin, Check, RefreshCw, Lock,
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
  const [selectedIdx, setSelectedIdx] = useState(slot.lockedIdx ?? 0)
  const [expanded, setExpanded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [busyLock, setBusyLock] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const Icon = TYPE_ICONS[slot.type] ?? Camera
  const isLocked = slot.lockedIdx != null
  const displayIdx = isLocked ? slot.lockedIdx! : selectedIdx
  const display = slot.options[displayIdx] ?? slot.options[0]
  const alternatives = slot.options.filter((_, i) => i !== displayIdx)
  const canRefresh = !!slot.keyword && !isLocked

  const handleToggleLock = async (idx: number) => {
    if (busyLock) return
    setError(null)
    setBusyLock(true)

    // Optimistic
    const newLocked = slot.lockedIdx === idx ? null : idx
    const prevSlot = slot
    setSlot({ ...slot, lockedIdx: newLocked })
    if (newLocked === null) setSelectedIdx(idx)
    setExpanded(false)

    try {
      const res = await fetch(`/api/plans/${planId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotIdx, optionIdx: newLocked }),
      })
      if (!res.ok) throw new Error("Could not save")
    } catch {
      // Revert on failure
      setSlot(prevSlot)
      setError("Could not save your pick. Try again.")
    } finally {
      setBusyLock(false)
    }
  }

  const handleRefresh = async () => {
    if (refreshing || !canRefresh) return
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
      setSlot(data.slot as PlanSlot)
      setSelectedIdx(0)
      setExpanded(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed")
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div
      className="rounded-2xl border bg-[#111] overflow-hidden transition-colors"
      style={{ borderColor: isLocked ? "rgba(123,97,255,0.4)" : "#1a1a1a" }}
    >
      {/* Slot header */}
      <div className="px-5 pt-5 pb-3 flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "rgba(123,97,255,0.12)", color: "#9B85FF" }}
        >
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span
              className="text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: "#9B85FF", fontFamily: "var(--font-satoshi)" }}
            >
              {TYPE_LABELS[slot.type]}
            </span>
            <span className="text-[10px] text-[#444]">·</span>
            <span className="text-[10px] text-[#666]" style={{ fontFamily: "var(--font-satoshi)" }}>
              {slot.time} · {slot.duration}
            </span>
            {isLocked && (
              <span
                className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{
                  backgroundColor: "rgba(123,97,255,0.18)",
                  color: "#9B85FF",
                  fontFamily: "var(--font-satoshi)",
                }}
              >
                <Lock size={10} />
                LOCKED IN
              </span>
            )}
          </div>
          <p className="text-sm text-[#bbb] leading-snug" style={{ fontFamily: "var(--font-satoshi)" }}>
            {slot.intent}
          </p>
        </div>
      </div>

      {/* Display option (selected or locked) */}
      {display && (
        <OptionCard
          option={display}
          isLocked={isLocked}
          onToggleLock={() => handleToggleLock(displayIdx)}
          busyLock={busyLock}
        />
      )}

      {/* Refresh + alternatives controls — hidden when locked */}
      {!isLocked && (
        <>
          {alternatives.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="w-full flex items-center justify-between px-5 py-3 border-t border-[#1a1a1a] text-sm text-[#888] hover:text-white hover:bg-[#141414] transition-colors"
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
            <div className="border-t border-[#1a1a1a] bg-[#0d0d0d]">
              {alternatives.map((opt, i) => {
                const realIdx = slot.options.indexOf(opt)
                return (
                  <button
                    key={opt.externalId ?? `${opt.name}-${i}`}
                    type="button"
                    onClick={() => {
                      setSelectedIdx(realIdx)
                      setExpanded(false)
                    }}
                    className="w-full text-left transition-colors hover:bg-[#141414]"
                  >
                    <OptionCard option={opt} compact />
                  </button>
                )
              })}
            </div>
          )}

          {canRefresh && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 border-t border-[#1a1a1a] text-sm text-[#888] hover:text-white hover:bg-[#141414] transition-colors disabled:opacity-50"
              style={{ fontFamily: "var(--font-satoshi)" }}
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Finding new options…" : "Show different options"}
            </button>
          )}

          {error && (
            <div
              className="px-5 py-3 border-t border-[#1a1a1a] text-xs text-red-300"
              style={{ fontFamily: "var(--font-satoshi)" }}
            >
              {error}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function OptionCard({
  option,
  compact,
  isLocked,
  onToggleLock,
  busyLock,
}: {
  option: PlanOption
  compact?: boolean
  isLocked?: boolean
  onToggleLock?: () => void
  busyLock?: boolean
}) {
  if (!option) return null
  const showLockButton = onToggleLock && !compact

  return (
    <div className={`px-5 ${compact ? "py-4 border-t border-[#1a1a1a]" : "pb-5"}`}>
      {option.imageUrl && !compact && (
        <div className="rounded-xl overflow-hidden bg-[#0d0d0d] mb-3 border border-[#1a1a1a]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={option.imageUrl}
            alt={option.name}
            className="w-full h-44 object-cover"
            loading="lazy"
          />
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-2">
        <h3
          className={`${compact ? "text-base" : "text-lg"} font-semibold text-white leading-tight flex-1 min-w-0`}
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
        {option.address && !compact && (
          <span className="inline-flex items-center gap-1 truncate max-w-full">
            <MapPin size={11} />
            <span className="truncate">{option.address}</span>
          </span>
        )}
      </div>

      {!compact && (
        <div className="flex items-center gap-2 flex-wrap">
          {showLockButton && (
            <button
              type="button"
              onClick={onToggleLock}
              disabled={busyLock}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium border transition-all active:scale-[0.98] disabled:opacity-50"
              style={{
                fontFamily: "var(--font-satoshi)",
                backgroundColor: isLocked ? "#7B61FF" : "transparent",
                borderColor: isLocked ? "#7B61FF" : "#7B61FF",
                color: isLocked ? "#fff" : "#9B85FF",
              }}
            >
              {isLocked ? <Check size={14} strokeWidth={3} /> : <Star size={14} />}
              {isLocked ? "Locked in" : "Lock this in"}
            </button>
          )}
          {option.actions.primary && (
            <a
              href={option.actions.primary.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all hover:opacity-90 active:scale-[0.98] border"
              style={{
                fontFamily: "var(--font-satoshi)",
                backgroundColor: "#1a1a1a",
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
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium border border-[#222] text-[#bbb] hover:text-white hover:border-[#444] transition-all"
              style={{ fontFamily: "var(--font-satoshi)" }}
            >
              <MapPin size={13} />
            </a>
          )}
        </div>
      )}

      {compact && (
        <div
          className="text-xs text-[#666] flex items-center gap-1"
          style={{ fontFamily: "var(--font-satoshi)" }}
        >
          <Check size={11} />
          Tap to swap into your plan
        </div>
      )}
    </div>
  )
}
