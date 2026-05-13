import Link from "next/link"
import { Mail } from "lucide-react"

export default function VerifyPage() {
  return (
    <div className="min-h-screen bg-[#0B0814] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: "rgba(123,97,255,0.1)" }}
        >
          <Mail size={28} style={{ color: "#7B61FF" }} />
        </div>

        <h1
          className="text-2xl font-semibold text-white mb-3"
          style={{ fontFamily: "var(--font-clash)" }}
        >
          Check your inbox
        </h1>
        <p
          className="text-[#888] text-sm leading-relaxed mb-8"
          style={{ fontFamily: "var(--font-satoshi)" }}
        >
          We sent you a magic link. Click it to sign in — no password needed. The link expires in 24 hours.
        </p>

        <Link
          href="/auth/signin"
          className="text-sm text-[#7B61FF] hover:text-[#9B85FF] transition-colors"
          style={{ fontFamily: "var(--font-satoshi)" }}
        >
          Use a different email →
        </Link>
      </div>
    </div>
  )
}
