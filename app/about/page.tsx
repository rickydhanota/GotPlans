import { MapPin, Users, Sparkles, ArrowRight, Calendar, Heart, Zap } from "lucide-react";
import Link from "next/link";

export default function About() {
  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0A]">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-[#1A1A1A] backdrop-blur-md bg-[#0A0A0A]/80">
        <span
          className="text-xl font-semibold tracking-tight text-white"
          style={{ fontFamily: "var(--font-clash)" }}
        >
          Got<span style={{ color: "#7B61FF" }}>Plans</span>
        </span>
        <div className="hidden md:flex items-center gap-8 text-sm text-[#888888]" style={{ fontFamily: "var(--font-satoshi)" }}>
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/auth/signin"
            className="text-sm text-[#888888] hover:text-white transition-colors px-4 py-2"
            style={{ fontFamily: "var(--font-satoshi)" }}
          >
            Sign in
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-white px-4 py-2 rounded-full transition-all hover:opacity-90"
            style={{ backgroundColor: "#7B61FF", fontFamily: "var(--font-satoshi)" }}
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1">
        <section className="relative flex flex-col items-center justify-center min-h-screen pt-24 pb-20 px-6 text-center overflow-hidden">
          {/* Background glow */}
          <div
            className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(123,97,255,0.12) 0%, transparent 70%)" }}
          />

          <div className="relative z-10 max-w-4xl mx-auto">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm mb-8"
              style={{
                borderColor: "rgba(123,97,255,0.3)",
                backgroundColor: "rgba(123,97,255,0.08)",
                color: "#9B85FF",
                fontFamily: "var(--font-satoshi)"
              }}
            >
              <Sparkles size={14} />
              <span>AI-powered date & group curation</span>
            </div>

            {/* Headline */}
            <h1
              className="text-5xl md:text-7xl font-semibold leading-[1.05] tracking-tight text-white mb-6"
              style={{ fontFamily: "var(--font-clash)" }}
            >
              Stop planning.{" "}
              <br />
              <span style={{
                backgroundImage: "linear-gradient(135deg, #7B61FF 0%, #A78BFA 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text"
              }}>
                Start living.
              </span>
            </h1>

            <p
              className="text-lg md:text-xl text-[#888888] max-w-xl mx-auto mb-10 leading-relaxed"
              style={{ fontFamily: "var(--font-satoshi)" }}
            >
              Tell us your vibe, your crew, and your city. GotPlans does the rest — curating perfect experiences for dates, friend groups, and everything in between.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 px-8 py-4 rounded-full text-base font-medium text-white transition-all hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
                style={{ backgroundColor: "#7B61FF", fontFamily: "var(--font-satoshi)", boxShadow: "0 0 40px rgba(123,97,255,0.25)" }}
              >
                Curate my plans
                <ArrowRight size={18} />
              </Link>
              <a
                href="#features"
                className="flex items-center gap-2 px-8 py-4 rounded-full text-base font-medium text-[#888888] border border-[#222222] hover:border-[#333333] hover:text-white transition-all"
                style={{ fontFamily: "var(--font-satoshi)" }}
              >
                See how it works
              </a>
            </div>

            {/* Social proof */}
            <p
              className="mt-8 text-sm text-[#555555]"
              style={{ fontFamily: "var(--font-satoshi)" }}
            >
              Trusted by 10,000+ planners across 50+ cities
            </p>
          </div>

          {/* Floating cards */}
          <div className="relative z-10 w-full max-w-5xl mx-auto mt-20 grid grid-cols-1 md:grid-cols-3 gap-4 px-4">
            {[
              {
                icon: <Heart size={20} style={{ color: "#7B61FF" }} />,
                label: "Date Night",
                desc: "Rooftop cocktails → jazz bar → late-night ramen",
                tag: "2 people · Tonight"
              },
              {
                icon: <Users size={20} style={{ color: "#7B61FF" }} />,
                label: "Squad Outing",
                desc: "Escape room → BBQ spot → arcade bar",
                tag: "8 people · Saturday"
              },
              {
                icon: <Calendar size={20} style={{ color: "#7B61FF" }} />,
                label: "Birthday Bash",
                desc: "Spa day → private dining → club exclusive",
                tag: "6 people · Next week"
              }
            ].map((card, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 p-5 rounded-2xl border transition-all hover:border-[rgba(123,97,255,0.3)] hover:bg-[#1A1A1A] cursor-pointer"
                style={{ background: "#111111", borderColor: "#222222" }}
              >
                <div className="flex items-center gap-2">
                  {card.icon}
                  <span
                    className="text-sm font-semibold text-white"
                    style={{ fontFamily: "var(--font-clash)" }}
                  >
                    {card.label}
                  </span>
                </div>
                <p
                  className="text-sm text-[#888888] leading-relaxed"
                  style={{ fontFamily: "var(--font-satoshi)" }}
                >
                  {card.desc}
                </p>
                <span
                  className="text-xs px-3 py-1 rounded-full w-fit"
                  style={{
                    backgroundColor: "rgba(123,97,255,0.1)",
                    color: "#9B85FF",
                    fontFamily: "var(--font-satoshi)"
                  }}
                >
                  {card.tag}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-24 px-6 border-t border-[#1A1A1A]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2
                className="text-4xl md:text-5xl font-semibold text-white mb-4"
                style={{ fontFamily: "var(--font-clash)" }}
              >
                Built for real plans
              </h2>
              <p
                className="text-[#888888] text-lg max-w-md mx-auto"
                style={{ fontFamily: "var(--font-satoshi)" }}
              >
                Not generic suggestions. Hyper-local, AI-curated experiences tailored to your exact vibe.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  icon: <Sparkles size={24} style={{ color: "#7B61FF" }} />,
                  title: "AI Curation",
                  desc: "Claude AI understands your preferences and curates a full itinerary — not just a list of restaurants."
                },
                {
                  icon: <MapPin size={24} style={{ color: "#7B61FF" }} />,
                  title: "Hyper-Local",
                  desc: "Powered by Google Places, we surface hidden gems and trending spots near you in real time."
                },
                {
                  icon: <Zap size={24} style={{ color: "#7B61FF" }} />,
                  title: "Instant Plans",
                  desc: "Get a complete, shareable plan in seconds. No endless scrolling, no group-chat debates."
                }
              ].map((feat, i) => (
                <div
                  key={i}
                  className="p-6 rounded-2xl border transition-all hover:border-[rgba(123,97,255,0.2)]"
                  style={{ background: "#111111", borderColor: "#1A1A1A" }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: "rgba(123,97,255,0.1)" }}
                  >
                    {feat.icon}
                  </div>
                  <h3
                    className="text-lg font-semibold text-white mb-2"
                    style={{ fontFamily: "var(--font-clash)" }}
                  >
                    {feat.title}
                  </h3>
                  <p
                    className="text-[#888888] text-sm leading-relaxed"
                    style={{ fontFamily: "var(--font-satoshi)" }}
                  >
                    {feat.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Footer Banner */}
        <section className="py-24 px-6">
          <div
            className="max-w-4xl mx-auto rounded-3xl p-12 text-center relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, rgba(123,97,255,0.15) 0%, rgba(123,97,255,0.05) 100%)", border: "1px solid rgba(123,97,255,0.2)" }}
          >
            <h2
              className="text-4xl md:text-5xl font-semibold text-white mb-4"
              style={{ fontFamily: "var(--font-clash)" }}
            >
              Ready to stop overthinking?
            </h2>
            <p
              className="text-[#888888] text-lg mb-8 max-w-md mx-auto"
              style={{ fontFamily: "var(--font-satoshi)" }}
            >
              Join thousands of people who let GotPlans handle the planning so they can focus on the fun.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-base font-medium text-white transition-all hover:opacity-90"
              style={{ backgroundColor: "#7B61FF", fontFamily: "var(--font-satoshi)" }}
            >
              Get started free
              <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1A1A1A] px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span
            className="text-lg font-semibold text-white"
            style={{ fontFamily: "var(--font-clash)" }}
          >
            Got<span style={{ color: "#7B61FF" }}>Plans</span>
          </span>
          <p
            className="text-sm text-[#555555]"
            style={{ fontFamily: "var(--font-satoshi)" }}
          >
            © 2025 GotPlans. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
