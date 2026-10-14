import { Jost, Montserrat, Poppins, Geist_Mono } from "next/font/google"
import type { Metadata } from "next"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_URL ?? "https://astro.solivana.io",
  ),
  title: {
    default: "SoliVana Astro — Karmic Interpreter",
    template: "%s · SoliVana Astro",
  },
  description:
    "Vedic + Western natal chart reading in minutes: six interpretation lenses, dasha timing, and exportable reports.",
}

// SoliVana brand typography (matches solivana.io).
const jost = Jost({ subsets: ["latin"], variable: "--font-jost" })
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
})
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-poppins",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        jost.variable,
        montserrat.variable,
        poppins.variable,
        fontMono.variable,
        "font-sans",
      )}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
