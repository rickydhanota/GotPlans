import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import SessionProvider from "@/components/SessionProvider"
import "./globals.css"

const clashDisplay = localFont({
  src: [
    { path: "../public/fonts/ClashDisplay-Regular.woff2", weight: "400" },
    { path: "../public/fonts/ClashDisplay-Medium.woff2", weight: "500" },
    { path: "../public/fonts/ClashDisplay-Semibold.woff2", weight: "600" },
    { path: "../public/fonts/ClashDisplay-Bold.woff2", weight: "700" },
  ],
  variable: "--font-clash",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
})

const satoshi = localFont({
  src: [
    { path: "../public/fonts/Satoshi-Regular.woff2", weight: "400" },
    { path: "../public/fonts/Satoshi-Medium.woff2", weight: "500" },
    { path: "../public/fonts/Satoshi-Bold.woff2", weight: "700" },
  ],
  variable: "--font-satoshi",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
})

export const metadata: Metadata = {
  title: "GotPlans — AI-Powered Date & Group Plans",
  description: "Let AI curate the perfect date or group outing for you.",
  manifest: "/manifest.json",
  applicationName: "GotPlans",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "GotPlans",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",  // lets content extend under iOS notch / home indicator
  themeColor: "#0B0814",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${clashDisplay.variable} ${satoshi.variable} h-full`}>
      <body className="min-h-full flex flex-col text-[#F5F5F5] font-[family-name:var(--font-satoshi)]">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
