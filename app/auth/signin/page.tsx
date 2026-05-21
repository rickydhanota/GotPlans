import { signIn } from "@/auth"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import GoogleSignInButton from "@/components/GoogleSignInButton"

const ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: "Could not start sign-in. Try again.",
  OAuthCallback: "Sign-in failed. Try again.",
  OAuthCreateAccount: "Could not create account. Try again.",
  EmailSignin: "Failed to send magic link. Check your email address.",
  CredentialsSignin: "Invalid credentials.",
  Default: "Something went wrong. Please try again.",
}

const APPLE_ENABLED = !!process.env.APPLE_CLIENT_ID && !!process.env.APPLE_CLIENT_SECRET

const EMAIL_ENABLED =
  !!process.env.EMAIL_SERVER &&
  !process.env.EMAIL_SERVER.includes("smtp.example.com") &&
  !process.env.EMAIL_SERVER.includes("REPLACE_WITH_") &&
  !!process.env.EMAIL_FROM

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  const { callbackUrl, error } = await searchParams
  const redirectTo = callbackUrl || "/dashboard"
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? `${ERROR_MESSAGES.Default} (code: ${error})`) : null

  return (
    <div className="min-h-screen bg-[#0B0814] flex flex-col items-center justify-center px-4">
      {/* Back to home */}
      <Link
        href="/"
        className="absolute top-6 left-6 text-sm text-[#555] hover:text-white transition-colors"
        style={{ fontFamily: "var(--font-satoshi)" }}
      >
        ← Back
      </Link>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/">
            <span
              className="text-2xl font-semibold tracking-tight text-white"
              style={{ fontFamily: "var(--font-clash)" }}
            >
              Got<span style={{ color: "#7B61FF" }}>Plans</span>
            </span>
          </Link>
          <p
            className="mt-3 text-[#888] text-sm"
            style={{ fontFamily: "var(--font-satoshi)" }}
          >
            Sign in to start curating your plans
          </p>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div
            className="mb-6 px-4 py-3 rounded-xl text-sm text-red-300 border border-red-900 bg-red-950/40"
            style={{ fontFamily: "var(--font-satoshi)" }}
          >
            {errorMessage}
          </div>
        )}

        {/* Google sign-in: web → server-action OAuth, native → ID-token via plugin */}
        <form
          action={async () => {
            "use server"
            try {
              await signIn("google", { redirectTo })
            } catch (e) {
              if (e instanceof AuthError) throw e
              throw e
            }
          }}
        >
          <GoogleSignInButton
            redirectTo={redirectTo}
            serverClientId={process.env.GOOGLE_CLIENT_ID!}
            iosClientId={process.env.GOOGLE_IOS_CLIENT_ID}
          />
        </form>

        {/* Apple OAuth — only shown when APPLE_* env vars are set */}
        {APPLE_ENABLED && (
          <form
            className="mt-3"
            action={async () => {
              "use server"
              try {
                await signIn("apple", { redirectTo })
              } catch (e) {
                if (e instanceof AuthError) throw e
                throw e
              }
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-[#2a2a2a] bg-black text-white text-sm font-medium hover:bg-[#0a0a0a] hover:border-[#7B61FF]/40 transition-all"
              style={{ fontFamily: "var(--font-satoshi)" }}
            >
              <AppleIcon />
              Continue with Apple
            </button>
          </form>
        )}

        {EMAIL_ENABLED && (
          <>
            {/* Divider */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-[#1e1e1e]" />
              <span className="text-xs text-[#444]" style={{ fontFamily: "var(--font-satoshi)" }}>
                or continue with email
              </span>
              <div className="flex-1 h-px bg-[#1e1e1e]" />
            </div>

            {/* Magic link form */}
            <form
              action={async (formData: FormData) => {
                "use server"
                const email = formData.get("email") as string
                if (!email) return
                try {
                  await signIn("nodemailer", { email, redirectTo })
                } catch (e) {
                  if (e instanceof AuthError) throw e
                  throw e
                }
              }}
              className="flex flex-col gap-3"
            >
              <input
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border border-[#322C48] bg-[#14111E] text-white text-sm placeholder:text-[#444] focus:outline-none focus:border-[#7B61FF]/60 transition-colors"
                style={{ fontFamily: "var(--font-satoshi)" }}
              />
              <button
                type="submit"
                className="w-full py-3 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
                style={{ backgroundColor: "#7B61FF", fontFamily: "var(--font-satoshi)" }}
              >
                Send magic link
              </button>
            </form>
          </>
        )}

        <p
          className="mt-8 text-center text-xs text-[#444] leading-relaxed"
          style={{ fontFamily: "var(--font-satoshi)" }}
        >
          By signing in you agree to our{" "}
          <a href="#" className="text-[#666] hover:text-white transition-colors">Terms</a>
          {" "}and{" "}
          <a href="#" className="text-[#666] hover:text-white transition-colors">Privacy Policy</a>.
        </p>
      </div>
    </div>
  )
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
    </svg>
  )
}

