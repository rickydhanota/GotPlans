"use client"

import { useEffect, useState } from "react"
import { Capacitor } from "@capacitor/core"
import { SocialLogin } from "@capgo/capacitor-social-login"
import { signIn } from "next-auth/react"

/**
 * Google sign-in button that picks the right strategy per platform:
 *   • Web (or Safari in sim): submits the server-action form that calls
 *     `signIn("google", ...)` — full OAuth redirect via Auth.js.
 *   • Native (iOS/Android in Capacitor): invokes the native Google sheet,
 *     gets back a Google ID token, and posts it to the `google-native`
 *     Credentials provider in NextAuth, which verifies and creates a session.
 *
 * The web path lives in the parent <form action>. This component only renders
 * the visible button + handles the native-only click path.
 */
export default function GoogleSignInButton({
  redirectTo,
  serverClientId,
  iosClientId,
}: {
  redirectTo: string
  serverClientId: string
  iosClientId?: string
}) {
  const [isNative, setIsNative] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform())
  }, [])

  useEffect(() => {
    if (!isNative) return
    SocialLogin.initialize({
      google: {
        webClientId: serverClientId,
        ...(iosClientId ? { iOSClientId: iosClientId } : {}),
        mode: "online",
      },
    }).catch((e) => {
      console.error("SocialLogin.initialize failed", e)
    })
  }, [isNative, serverClientId, iosClientId])

  if (!isNative) {
    // On web, the surrounding <form action> handles submission via server
    // action — render a normal submit button that triggers it.
    return (
      <button
        type="submit"
        className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-[#2a2a2a] bg-[#14111E] text-white text-sm font-medium hover:bg-[#1a1a1a] hover:border-[#7B61FF]/40 transition-all"
        style={{ fontFamily: "var(--font-satoshi)" }}
      >
        <GoogleIcon />
        Continue with Google
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const result = await SocialLogin.login({
              provider: "google",
              options: { scopes: ["email", "profile"] },
            })
            // capgo plugin returns { provider, result: { idToken, ... } } on success
            const idToken =
              (result as { result?: { idToken?: string } })?.result?.idToken
            if (!idToken) throw new Error("No ID token returned from Google")
            const res = await signIn("google-native", {
              idToken,
              redirect: false,
            })
            if (res?.error) throw new Error(res.error)
            window.location.href = redirectTo
          } catch (e) {
            console.error("Native Google sign-in failed", e)
            setError(e instanceof Error ? e.message : "Sign-in failed")
            setBusy(false)
          }
        }}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-[#2a2a2a] bg-[#14111E] text-white text-sm font-medium hover:bg-[#1a1a1a] hover:border-[#7B61FF]/40 transition-all disabled:opacity-60"
        style={{ fontFamily: "var(--font-satoshi)" }}
      >
        <GoogleIcon />
        {busy ? "Signing in…" : "Continue with Google"}
      </button>
      {error && (
        <p
          className="mt-2 text-xs text-red-400"
          style={{ fontFamily: "var(--font-satoshi)" }}
        >
          {error}
        </p>
      )}
    </>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}
