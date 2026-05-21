import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Apple from "next-auth/providers/apple"
import Nodemailer from "next-auth/providers/nodemailer"
import Credentials from "next-auth/providers/credentials"
import { OAuth2Client } from "google-auth-library"
import { SupabaseAdapter } from "@auth/supabase-adapter"

// Native (iOS/Android) Google Sign-In: the Capacitor plugin returns a Google
// ID token from the OS-level sign-in sheet. We verify it server-side here and
// upsert the user, bypassing the OAuth redirect flow that WKWebView breaks.
const googleNative = Credentials({
  id: "google-native",
  name: "Google (Native)",
  credentials: { idToken: { label: "ID Token", type: "text" } },
  async authorize(credentials) {
    const idToken = credentials?.idToken as string | undefined
    if (!idToken) return null
    const audiences = [
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
    ].filter(Boolean) as string[]
    const client = new OAuth2Client()
    const ticket = await client.verifyIdToken({ idToken, audience: audiences })
    const payload = ticket.getPayload()
    if (!payload?.sub || !payload.email) return null
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name ?? null,
      image: payload.picture ?? null,
    }
  },
})

const providers = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  }),
  googleNative,
]

if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
  providers.push(
    Apple({
      clientId: process.env.APPLE_CLIENT_ID,
      clientSecret: process.env.APPLE_CLIENT_SECRET,
    }) as never,
  )
}

// Nodemailer (magic link) — only register when SMTP creds look real, so the
// dashboard doesn't show a broken "Send magic link" button against the
// example.com placeholder.
if (
  process.env.EMAIL_SERVER &&
  !process.env.EMAIL_SERVER.includes("smtp.example.com") &&
  !process.env.EMAIL_SERVER.includes("REPLACE_WITH_") &&
  process.env.EMAIL_FROM
) {
  providers.push(
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
    }) as never,
  )
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: SupabaseAdapter({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  }),
  providers,
  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify",
    error: "/auth/signin",
  },
  basePath: "/api/auth",
  trustHost: true,
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      return session
    },
  },
})
