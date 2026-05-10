import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, BookOpen, Sparkles, LogOut, MapPin, ArrowRight } from "lucide-react"
import { supabaseAdmin } from "@/lib/supabase-admin"

interface PlanRow {
  id: string
  title: string
  summary: string
  inputs: { city: string; budget: number; groupSize: string }
  created_at: string
}

function formatRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return "just now"
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  const firstName = session.user.name?.split(" ")[0] ?? "there"

  const { data: plans } = await supabaseAdmin
    .from("plans")
    .select("id, title, summary, inputs, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(50)

  const planRows = (plans ?? []) as PlanRow[]

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Nav */}
      <nav className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <Link href="/">
          <span
            className="text-xl font-semibold tracking-tight text-white"
            style={{ fontFamily: "var(--font-clash)" }}
          >
            Got<span style={{ color: "#7B61FF" }}>Plans</span>
          </span>
        </Link>

        <div className="flex items-center gap-4">
          {session.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.user.image}
              alt={session.user.name ?? "User"}
              className="w-8 h-8 rounded-full border border-[#2a2a2a]"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
              style={{ backgroundColor: "#7B61FF" }}
            >
              {firstName[0].toUpperCase()}
            </div>
          )}

          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/" })
            }}
          >
            <button
              type="submit"
              className="flex items-center gap-1.5 text-sm text-[#555] hover:text-white transition-colors"
              style={{ fontFamily: "var(--font-satoshi)" }}
            >
              <LogOut size={14} />
              Sign out
            </button>
          </form>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Welcome */}
        <div className="mb-12">
          <p
            className="text-sm text-[#7B61FF] font-medium mb-2"
            style={{ fontFamily: "var(--font-satoshi)" }}
          >
            Welcome back
          </p>
          <h1
            className="text-4xl md:text-5xl font-semibold text-white mb-3"
            style={{ fontFamily: "var(--font-clash)" }}
          >
            Hey, {firstName} 👋
          </h1>
          <p
            className="text-[#888] text-lg"
            style={{ fontFamily: "var(--font-satoshi)" }}
          >
            Ready to plan something great?
          </p>
        </div>

        {/* Create New Plan CTA */}
        <Link href="/">
          <div
            className="relative rounded-2xl p-8 mb-10 cursor-pointer overflow-hidden group transition-all hover:scale-[1.01]"
            style={{
              background: "linear-gradient(135deg, rgba(123,97,255,0.2) 0%, rgba(123,97,255,0.06) 100%)",
              border: "1px solid rgba(123,97,255,0.3)",
            }}
          >
            {/* Glow */}
            <div
              className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-30 group-hover:opacity-50 transition-opacity"
              style={{ background: "#7B61FF" }}
            />

            <div className="relative flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={18} style={{ color: "#7B61FF" }} />
                  <span
                    className="text-sm font-medium"
                    style={{ color: "#9B85FF", fontFamily: "var(--font-satoshi)" }}
                  >
                    AI-powered
                  </span>
                </div>
                <h2
                  className="text-2xl md:text-3xl font-semibold text-white mb-1"
                  style={{ fontFamily: "var(--font-clash)" }}
                >
                  Create New Plan
                </h2>
                <p
                  className="text-[#888] text-sm"
                  style={{ fontFamily: "var(--font-satoshi)" }}
                >
                  Tell us your vibe and we'll build the perfect itinerary
                </p>
              </div>

              <div
                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "#7B61FF" }}
              >
                <Plus size={22} className="text-white" />
              </div>
            </div>
          </div>
        </Link>

        {/* Saved Plans */}
        <div>
          <div className="flex items-center gap-2 mb-6">
            <BookOpen size={18} className="text-[#555]" />
            <h2
              className="text-lg font-semibold text-white"
              style={{ fontFamily: "var(--font-clash)" }}
            >
              My Saved Plans
            </h2>
          </div>

          {planRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#222] p-12 flex flex-col items-center justify-center text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ backgroundColor: "rgba(123,97,255,0.08)" }}
              >
                <MapPin size={24} style={{ color: "#7B61FF" }} />
              </div>
              <h3
                className="text-base font-semibold text-white mb-2"
                style={{ fontFamily: "var(--font-clash)" }}
              >
                No plans yet
              </h3>
              <p
                className="text-sm text-[#555] max-w-xs leading-relaxed"
                style={{ fontFamily: "var(--font-satoshi)" }}
              >
                Your saved and generated plans will appear here. Create your first one above.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {planRows.map(p => (
                <Link
                  key={p.id}
                  href={`/plan/${p.id}`}
                  className="flex items-center gap-4 p-5 rounded-2xl border border-[#1a1a1a] bg-[#111] hover:border-[#2a2a2a] hover:bg-[#141414] transition-all group"
                >
                  <div className="flex-1 min-w-0">
                    <h3
                      className="text-lg font-semibold text-white mb-1 truncate"
                      style={{ fontFamily: "var(--font-clash)" }}
                    >
                      {p.title}
                    </h3>
                    <p
                      className="text-sm text-[#888] truncate mb-2"
                      style={{ fontFamily: "var(--font-satoshi)" }}
                    >
                      {p.summary}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-[#555]" style={{ fontFamily: "var(--font-satoshi)" }}>
                      <span className="flex items-center gap-1"><MapPin size={11} />{p.inputs.city}</span>
                      <span>·</span>
                      <span>${p.inputs.budget}/person</span>
                      <span>·</span>
                      <span>{formatRelative(p.created_at)}</span>
                    </div>
                  </div>
                  <ArrowRight size={18} className="text-[#444] group-hover:text-[#7B61FF] transition-colors flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
