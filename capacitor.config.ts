import type { CapacitorConfig } from "@capacitor/cli"

// Capacitor wraps the deployed web app in a thin native shell so you can ship
// to the iOS App Store and Google Play. This is intentionally a remote-loaded
// app (server param points at production), NOT a static export — because the
// app uses Next.js server components, server actions, NextAuth, and API routes
// that need a running server.
//
// Setup (once you've deployed to a real URL):
//   1. Replace `server.url` below with your production URL (e.g. https://gotplans.app)
//   2. npx cap add ios       # creates ios/ native project (needs Xcode)
//   3. npx cap add android   # creates android/ native project (needs Android Studio)
//   4. npx cap sync          # copies web assets and updates plugins
//   5. npx cap open ios      # opens in Xcode to build/run
//
// App store note: Apple Guideline 4.2.2 rejects pure repackaged websites. To
// get accepted, your app should add native-only value over time — push
// notifications, native share sheets, biometric login, etc. via Capacitor
// plugins. The web shell is fine for v1, but plan for that.

const config: CapacitorConfig = {
  appId: "com.gotplans.app",
  appName: "GotPlans",
  // webDir is required even when loading remotely. Capacitor copies an offline
  // fallback page here; the live app comes from server.url at runtime.
  webDir: "public",
  server: {
    // Replace with your deployed URL before running `npx cap sync`.
    // Use `npm run dev` URL during local mobile testing (e.g. http://10.0.0.27:3000).
    url: process.env.CAPACITOR_SERVER_URL ?? "https://gotplans.app",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#0A0A0A",
  },
  android: {
    backgroundColor: "#0A0A0A",
  },
}

export default config
