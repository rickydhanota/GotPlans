import type { Metadata } from "next"
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
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${clashDisplay.variable} ${satoshi.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-[#0A0A0A] text-[#F5F5F5] font-[family-name:var(--font-satoshi)]">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
