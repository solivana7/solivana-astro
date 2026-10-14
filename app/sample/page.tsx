import Link from "next/link"
import type { Metadata } from "next"

import { ResultsDashboard } from "@/components/results-dashboard"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { sampleReport } from "@/lib/sample-report-data"
import { Sparkles } from "lucide-react"

export const metadata: Metadata = {
  title: "Sample reading",
  description:
    "A real SoliVana AI reading, generated for a sample chart — every section, wheel, and word you'll receive for your own birth moment.",
  openGraph: {
    title: "Sample reading · SoliVana Astro",
    description:
      "A real SoliVana AI reading, generated for a sample chart — every section, wheel, and word you'll receive for your own birth moment.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", images: ["/og-image.png"] },
}

export default function SamplePage() {
  return (
    <>
      <SiteHeader />
      <div className="border-b border-[#B49F90]/20 bg-[#1F1208] px-6 py-10 text-center text-[#F0EDED]">
        <p className="text-xs font-medium tracking-[0.3em] text-[#EC9247] uppercase">
          Sample reading
        </p>
        <h1 className="font-heading mt-3 text-2xl font-medium sm:text-3xl">
          This is a real SoliVana AI reading.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#F0EDED]/80">
          Generated for a sample chart — every section, wheel, and word is what
          you&apos;ll receive for your own birth moment.
        </p>
        <Button
          size="lg"
          nativeButton={false}
          className="mt-6 h-12 gap-2 rounded-lg bg-[#EC9247] px-8 text-base font-semibold text-[#1F1208] shadow-lg shadow-[#EC9247]/20 hover:bg-[#d97e35]"
          render={<Link href="/reading" />}
        >
          <Sparkles className="size-5" />
          Create your reading
        </Button>
      </div>

      <ResultsDashboard
        reading={sampleReport.reading}
        chartData={sampleReport.chartData}
        chartSvgs={sampleReport.chartSvgs}
        sections={sampleReport.sections}
        reportMarkdown={sampleReport.reportMarkdown}
        reportUrls={{ docx: null, pdf: null, ics: null }}
        sample
      />
    </>
  )
}
