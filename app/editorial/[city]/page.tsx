import Link from "next/link"
import { ArrowLeft, ExternalLink, MapPin, Sparkles } from "lucide-react"
import { getEditorialPicks } from "@/lib/editorial"

export const revalidate = 3600  // page cache 1h; lib has its own DB cache

export default async function EditorialPage({
  params,
}: {
  params: Promise<{ city: string }>
}) {
  const { city: cityParam } = await params
  const city = decodeURIComponent(cityParam)
  const result = await getEditorialPicks("eater", city)

  return (
    <div className="min-h-screen bg-[#0B0814] flex flex-col">
      {/* Header */}
      <header className="px-4 pt-4 pb-3 flex items-center justify-between">
        <Link
          href="/"
          className="w-10 h-10 rounded-full flex items-center justify-center border border-[#322C48] text-[#aaa] hover:text-white hover:border-[#444] active:scale-90 transition-all"
        >
          <ArrowLeft size={18} />
        </Link>
        <Link
          href="/about"
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium border border-[#322C48] text-[#bbb] hover:text-white hover:border-[#444] transition-all"
          style={{ fontFamily: "var(--font-satoshi)" }}
        >
          GotPlans
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto px-5 pb-20">
        <div className="max-w-md mx-auto">
          <div className="pt-6 pb-6">
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-4 text-xs font-medium"
              style={{
                background: "rgba(123,97,255,0.12)",
                color: "#9B85FF",
                fontFamily: "var(--font-satoshi)",
              }}
            >
              <Sparkles size={12} />
              Critics' picks · Eater
            </div>
            <h1
              className="text-[34px] leading-[1.1] font-semibold text-white mb-2 tracking-tight"
              style={{ fontFamily: "var(--font-clash)" }}
            >
              {result ? `What's hot in ${prettyCity(city)}` : `Not covered yet`}
            </h1>
            <p
              className="text-[#888] text-sm leading-relaxed"
              style={{ fontFamily: "var(--font-satoshi)" }}
            >
              {result
                ? `Curated by Eater's editors. Full write-ups on Eater — links below each card.`
                : `Eater doesn't publish for ${prettyCity(city)} yet. Try San Francisco, LA, NYC, Chicago, Boston, Philadelphia, DC, Atlanta, Miami, Austin, Houston, Dallas, Denver, Detroit, Portland, Seattle, Las Vegas, San Diego, Nashville, New Orleans, or Twin Cities.`}
            </p>
          </div>

          {result && result.picks.length > 0 && (
            <div className="flex flex-col gap-3">
              {result.picks.map((p, i) => (
                <article
                  key={`${p.name}-${i}`}
                  className="rounded-2xl border border-[#262135] bg-[#14111E] overflow-hidden"
                >
                  {p.image && (
                    <div className="bg-[#0F0D18] border-b border-[#262135]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.image}
                        alt={p.name}
                        className="w-full h-44 object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="px-5 py-4">
                    <div className="flex items-start gap-2 mb-2">
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold flex-shrink-0 mt-0.5"
                        style={{
                          backgroundColor: "rgba(123,97,255,0.15)",
                          color: "#9B85FF",
                          fontFamily: "var(--font-satoshi)",
                        }}
                      >
                        {i + 1}
                      </span>
                      <h2
                        className="text-lg font-semibold text-white leading-tight"
                        style={{ fontFamily: "var(--font-clash)" }}
                      >
                        {p.name}
                      </h2>
                    </div>
                    {p.address && (
                      <div
                        className="flex items-center gap-1 text-xs text-[#666] mb-2"
                        style={{ fontFamily: "var(--font-satoshi)" }}
                      >
                        <MapPin size={11} />
                        <span>{p.address}</span>
                      </div>
                    )}
                    {p.description && (
                      <p
                        className="text-sm text-[#aaa] leading-relaxed mb-3"
                        style={{ fontFamily: "var(--font-satoshi)" }}
                      >
                        {p.description}
                      </p>
                    )}
                    {p.sourceUrl && (
                      <a
                        href={p.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#9B85FF] hover:text-white transition-colors"
                        style={{ fontFamily: "var(--font-satoshi)" }}
                      >
                        Read on Eater
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {result && result.picks.length === 0 && (
            <p
              className="text-sm text-[#666]"
              style={{ fontFamily: "var(--font-satoshi)" }}
            >
              No picks loaded. Eater may have changed their page structure — please report.
            </p>
          )}

          {result && (
            <p
              className="mt-8 text-xs text-[#444]"
              style={{ fontFamily: "var(--font-satoshi)" }}
            >
              Updated {new Date(result.fetchedAt).toLocaleDateString()}
              {result.fromCache && " · cached"}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}

function prettyCity(s: string): string {
  return s
    .split(/[\s,]+/)[0]
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}
