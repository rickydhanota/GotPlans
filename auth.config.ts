import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"
import Apple from "next-auth/providers/apple"

// Edge-safe config: no Node.js-only modules (no adapter, no nodemailer).
// Used by middleware to verify sessions without touching the database.
export const authConfig: NextAuthConfig = {
  providers: [Google, Apple],
  basePath: "/api/auth",
  trustHost: true,
  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify",
    error: "/auth/signin",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isProtected =
        nextUrl.pathname.startsWith("/dashboard") ||
        nextUrl.pathname.startsWith("/plan")
      if (isProtected) return isLoggedIn
      return true
    },
    jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      return session
    },
  },
}
