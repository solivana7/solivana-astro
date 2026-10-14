"use client"

import * as React from "react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import DOMPurify from "dompurify"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useMounted } from "@/hooks/use-mounted"
import type { ChartData } from "@/lib/chart"
import { ChartWheelVedic } from "@/components/chart-wheel-vedic"
import { ChartWheelWestern } from "@/components/chart-wheel-western"
import {
  FileText,
  Download,
  Calendar,
  Share2,
  Gift,
  Sparkles,
  Clock,
  CheckCircle,
  Mail,
  Loader2,
} from "lucide-react"

interface Section {
  id: string
  sectionType: string
  title: string
  content: string
  generatedAt: string
  tokensUsed: number
}

interface ReadingInfo {
  id: string
  status: string
  progress: number
  currentStep: string | null
  focusAreas: string[]
  createdAt: string
  completedAt: string | null
  expiresAt: string
}

interface ReportUrls {
  docx: string | null
  pdf: string | null
  ics: string | null
}

interface ResultsDashboardProps {
  reading: ReadingInfo
  chartData: ChartData | null
  chartSvgs: { vedic: string; western: string } | null
  sections: Section[]
  reportMarkdown: string | null
  reportUrls: ReportUrls
  /** Static sample mode: hides share, downloads, calendar, and expiry. */
  sample?: boolean
}

const FOCUS_LABELS: Record<string, string> = {
  life_purpose: "Life Purpose",
  finances: "Finances & Abundance",
  health: "Health & Vitality",
  relationships: "Relationships",
  business: "Business & Career",
  timing: "Timing & Transits",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    // Pin UTC so server-rendered and client-hydrated markup always agree.
    timeZone: "UTC",
  })
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.target = "_blank"
  a.rel = "noopener noreferrer"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

async function fetchReportFile(
  readingId: string,
  type: "docx" | "pdf" | "ics" | "chart",
) {
  // The download route streams the private blob after server-side checks.
  const res = await fetch(`/api/reading/${readingId}/download?type=${type}`)
  if (!res.ok) throw new Error("Download not available")
  const disposition = res.headers.get("content-disposition") ?? ""
  const filename =
    /filename="([^"]+)"/.exec(disposition)?.[1] ?? `reading-${readingId}.${type}`
  const objectUrl = URL.createObjectURL(await res.blob())
  triggerDownload(objectUrl, filename)
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
}

function sanitizeSvg(svg: string | undefined): string {
  if (!svg) return ""
  if (typeof window === "undefined") return ""
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true } })
}

// Section bodies start with a heading repeating the card title — strip it so
// the heading doesn't render twice (card header + markdown).
function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^\s*#{1,3}\s+[^\n]*(\n+|$)/, "")
}

function MarkdownSection({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ className, ...props }) => (
          <h1
            className={cn(
              "mt-8 mb-4 text-2xl font-medium tracking-tight text-[#1F1208]",
              className
            )}
            {...props}
          />
        ),
        h2: ({ className, ...props }) => (
          <h2
            className={cn(
              "mt-6 mb-3 text-xl font-medium tracking-tight text-[#1F1208]",
              className
            )}
            {...props}
          />
        ),
        h3: ({ className, ...props }) => (
          <h3
            className={cn(
              "mt-4 mb-2 text-lg font-medium text-[#331D01]",
              className
            )}
            {...props}
          />
        ),
        p: ({ className, ...props }) => (
          <p
            className={cn("mb-4 leading-7 text-[#5A4A3F] last:mb-0", className)}
            {...props}
          />
        ),
        ul: ({ className, ...props }) => (
          <ul
            className={cn(
              "mb-4 list-disc space-y-1 pl-5 text-[#5A4A3F]",
              className
            )}
            {...props}
          />
        ),
        ol: ({ className, ...props }) => (
          <ol
            className={cn(
              "mb-4 list-decimal space-y-1 pl-5 text-[#5A4A3F]",
              className
            )}
            {...props}
          />
        ),
        li: ({ className, ...props }) => (
          <li className={cn("leading-7", className)} {...props} />
        ),
        strong: ({ className, ...props }) => (
          <strong
            className={cn("font-medium text-[#1F1208]", className)}
            {...props}
          />
        ),
        blockquote: ({ className, ...props }) => (
          <blockquote
            className={cn(
              "font-heading my-6 border-l-2 border-[#EC9247] py-1 pl-5 text-xl leading-relaxed font-medium text-[#331D01]",
              className
            )}
            {...props}
          />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

export function ResultsDashboard({
  reading,
  chartData,
  chartSvgs,
  sections,
  reportMarkdown,
  reportUrls,
  sample = false,
}: ResultsDashboardProps) {
  const [downloading, setDownloading] = React.useState<
    "docx" | "pdf" | "ics" | "chart" | null
  >(null)
  const [downloadError, setDownloadError] = React.useState<string | null>(null)
  const [copyStatus, setCopyStatus] = React.useState<
    "idle" | "copied" | "error"
  >("idle")
  const [shareEmail, setShareEmail] = React.useState("")
  const [shareStatus, setShareStatus] = React.useState<
    "idle" | "sending" | "sent" | "error"
  >("idle")
  const [shareError, setShareError] = React.useState<string | null>(null)
  const mounted = useMounted()

  async function handleShareEmail(event: React.FormEvent) {
    event.preventDefault()
    setShareStatus("sending")
    setShareError(null)
    try {
      const res = await fetch(`/api/reading/${reading.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: shareEmail }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(json?.error ?? `Could not send (${res.status})`)
      }
      setShareStatus("sent")
      setShareEmail("")
      setTimeout(() => setShareStatus("idle"), 4000)
    } catch (error) {
      setShareError(
        error instanceof Error ? error.message : "Could not send the email.",
      )
      setShareStatus("error")
    }
  }

  async function download(type: "docx" | "pdf" | "ics" | "chart") {
    setDownloading(type)
    setDownloadError(null)
    try {
      await fetchReportFile(reading.id, type)
    } catch {
      setDownloadError("Download failed — please try again.")
    } finally {
      setDownloading(null)
    }
  }

  const shareUrl = mounted
    ? `${window.location.origin}/reading/${reading.id}`
    : ""

  const navItems = React.useMemo(() => {
    const items = [
      { id: "synthesis", label: "Synthesis" },
      { id: "charts", label: "Chart Wheels" },
    ]
    sections.forEach((section) => {
      items.push({
        id: `section-${section.sectionType}`,
        label: section.title,
      })
    })
    if (!sample) {
      items.push({ id: "calendar", label: "Calendar" })
      items.push({ id: "share", label: "Share" })
    }
    return items
  }, [sections, sample])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <main className="min-h-screen bg-[#F6F1EC]">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 border-b border-[#B49F90]/20 bg-[#F6F1EC]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-[#1F1208] text-[#C8A45C]">
              <Sparkles className="size-4" />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-[#1F1208]">
                Your Cosmic Blueprint
              </p>
              <p className="text-xs text-[#786455]">
                {reading.completedAt
                  ? `Completed ${formatDate(reading.completedAt)}`
                  : `Created ${formatDate(reading.createdAt)}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!sample && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="hidden border-[#B49F90]/30 text-[#331D01] sm:inline-flex"
                  disabled={!reportUrls.docx || downloading === "docx"}
                  onClick={() => download("docx")}
                >
                  <FileText className="mr-1.5 size-4" />
                  DOCX
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="hidden border-[#B49F90]/30 text-[#331D01] sm:inline-flex"
                  disabled={!reportUrls.pdf || downloading === "pdf"}
                  onClick={() => download("pdf")}
                >
                  <Download className="mr-1.5 size-4" />
                  PDF
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-[#EC9247] text-[#1F1208] hover:bg-[#EC9247]/90"
                  disabled={!reportUrls.ics || downloading === "ics"}
                  onClick={() => download("ics")}
                >
                  <Calendar className="mr-1.5 size-4" />
                  ICS
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <h1 className="sr-only">Your Karmic Interpreter reading</h1>
      {downloadError && (
        <p role="alert" className="bg-red-50 px-4 py-2 text-center text-sm text-red-700">
          {downloadError}
        </p>
      )}

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[220px_1fr_300px]">
        {/* Nav */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollTo(item.id)}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-[#786455] transition-colors hover:bg-[#B49F90]/10 hover:text-[#331D01]"
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <div className="space-y-8">
          <section id="synthesis" className="scroll-mt-20">
            <Card className="border-0 bg-white shadow-sm ring-1 ring-[#B49F90]/20">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge className="bg-[#C8A45C] text-[#1F1208] hover:bg-[#C8A45C]">
                    <CheckCircle className="mr-1 size-3" />
                    Reading complete
                  </Badge>
                </div>
                <CardTitle className="mt-2 text-[#1F1208]">
                  Your personalized synthesis
                </CardTitle>
                <CardDescription className="text-[#786455]">
                  A unified interpretation of your chart across all focus
                  areas. Generated by SoliVana AI — for reflection and
                  education, not advice.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportMarkdown ? (
                  <div className="max-w-none">
                    <MarkdownSection>{reportMarkdown}</MarkdownSection>
                  </div>
                ) : (
                  <p className="text-[#786455]">
                    The master report is still being compiled.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          <section id="charts" className="scroll-mt-20">
            <Card className="border-0 bg-white shadow-sm ring-1 ring-[#B49F90]/20">
              <CardHeader>
                <CardTitle className="text-[#1F1208]">Chart wheels</CardTitle>
                <CardDescription className="text-[#786455]">
                  Vedic and Western renderings of your natal sky.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {chartSvgs ? (
                  <div className="grid gap-6 md:grid-cols-2">
                    {chartSvgs.vedic && (
                      <div className="rounded-xl bg-[#1F1208] p-3">
                        <p className="mb-2 text-center text-sm font-medium text-[#C8A45C]">
                          Vedic chart
                        </p>
                        {mounted ? (
                          <div
                            className="mx-auto flex justify-center"
                            dangerouslySetInnerHTML={{
                              __html: sanitizeSvg(chartSvgs.vedic),
                            }}
                          />
                        ) : (
                          <div className="mx-auto flex h-48 items-center justify-center text-[#B49F90]">
                            Loading chart…
                          </div>
                        )}
                      </div>
                    )}
                    {chartSvgs.western && (
                      <div className="rounded-xl bg-[#1F1208] p-3">
                        <p className="mb-2 text-center text-sm font-medium text-[#C8A45C]">
                          Western chart
                        </p>
                        {mounted ? (
                          <div
                            className="mx-auto flex justify-center"
                            dangerouslySetInnerHTML={{
                              __html: sanitizeSvg(chartSvgs.western),
                            }}
                          />
                        ) : (
                          <div className="mx-auto flex h-48 items-center justify-center text-[#B49F90]">
                            Loading chart…
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[#786455]">Charts are being rendered.</p>
                )}

                <div className="mt-8 border-t border-[#B49F90]/20 pt-6">
                  <h3 className="mb-4 text-lg font-medium text-[#1F1208]">
                    Chart wheels
                  </h3>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="rounded-xl bg-[#1F1208] p-3">
                      <p className="mb-2 text-center text-sm font-medium text-[#C8A45C]">
                        South Indian (Vedic)
                      </p>
                      <div className="mx-auto flex justify-center">
                        <ChartWheelVedic chartData={chartData} />
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#1F1208] p-3">
                      <p className="mb-2 text-center text-sm font-medium text-[#C8A45C]">
                        Tropical (Western)
                      </p>
                      <div className="mx-auto flex justify-center">
                        <ChartWheelWestern chartData={chartData} />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {sections.map((section, index) => (
            <section key={section.id} id={`section-${section.sectionType}`} className="scroll-mt-20">
              <Card className="border-0 bg-white shadow-sm ring-1 ring-[#B49F90]/20">
                <CardHeader>
                  <p className="text-xs font-medium tracking-[0.25em] text-[#9C5A1A] uppercase">
                    {["I", "II", "III", "IV", "V", "VI"][index] ?? index + 1}
                    {" · "}
                    {FOCUS_LABELS[section.sectionType] || section.sectionType}
                  </p>
                  <CardTitle className="mt-1 font-heading text-2xl text-[#1F1208]">
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MarkdownSection>{stripLeadingH1(section.content)}</MarkdownSection>
                </CardContent>
              </Card>
            </section>
          ))}

          {!sample && (
          <section id="share" className="scroll-mt-20">
            <Card className="border-0 bg-[#1F1208] text-[#F6F1EC] shadow-sm">
              <CardHeader>
                <CardTitle className="text-[#F6F1EC]">
                  Share your reading
                </CardTitle>
                <CardDescription className="text-[#B49F90]">
                  Gift a reading to someone you love, or share your own.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 rounded-lg border border-[#B49F90]/20 bg-[#331D01] p-2">
                  <input
                    readOnly
                    aria-label="Share link"
                    value={shareUrl}
                    className="flex-1 bg-transparent px-2 text-sm text-[#F6F1EC] outline-none"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-[#B49F90]/30 text-[#F6F1EC] hover:bg-[#331D01]"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(shareUrl)
                        setCopyStatus("copied")
                      } catch {
                        setCopyStatus("error")
                      } finally {
                        setTimeout(() => setCopyStatus("idle"), 2000)
                      }
                    }}
                  >
                    <Share2 className="mr-1.5 size-4" />
                    {copyStatus === "copied"
                      ? "Copied!"
                      : copyStatus === "error"
                        ? "Failed"
                        : "Copy link"}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  className="w-full border-[#B49F90]/30 text-[#F6F1EC] hover:bg-[#331D01]"
                  disabled={downloading === "chart"}
                  onClick={() => download("chart")}
                >
                  <Download className="mr-2 size-4" />
                  {downloading === "chart"
                    ? "Rendering image…"
                    : "Download chart image (PNG)"}
                </Button>
                <form
                  onSubmit={handleShareEmail}
                  className="flex items-center gap-2 rounded-lg border border-[#B49F90]/20 bg-[#331D01] p-2"
                >
                  <input
                    type="email"
                    required
                    aria-label="Recipient email address"
                    value={shareEmail}
                    onChange={(event) => setShareEmail(event.target.value)}
                    placeholder="Email this report to someone…"
                    className="flex-1 bg-transparent px-2 text-sm text-[#F6F1EC] outline-none placeholder:text-[#B49F90]/60"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={shareStatus === "sending"}
                    className="shrink-0 border-[#B49F90]/30 text-[#F6F1EC] hover:bg-[#331D01]"
                  >
                    {shareStatus === "sending" ? (
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                    ) : (
                      <Mail className="mr-1.5 size-4" />
                    )}
                    {shareStatus === "sending"
                      ? "Sending…"
                      : shareStatus === "sent"
                        ? "Sent!"
                        : "Send"}
                  </Button>
                </form>
                {shareStatus === "error" && shareError ? (
                  <p className="text-sm text-red-400">{shareError}</p>
                ) : null}
                <Button
                  nativeButton={false}
                  className="w-full bg-[#EC9247] text-[#1F1208] hover:bg-[#EC9247]/90"
                  render={<Link href="/reading" />}
                >
                  <Gift className="mr-2 size-4" />
                  Gift a reading
                </Button>
              </CardContent>
            </Card>
          </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          {!sample && (
          <Card
            id="calendar"
            className="scroll-mt-20 border-0 bg-white shadow-sm ring-1 ring-[#B49F90]/20"
          >
            <CardHeader>
              <CardTitle className="text-[#1F1208]">Calendar export</CardTitle>
              <CardDescription className="text-[#786455]">
                Add key dates and transits to your calendar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-[#F6F1EC] p-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-[#EC9247]/10 text-[#EC9247]">
                  <Calendar className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#331D01]">
                    Download .ics file
                  </p>
                  <p className="text-xs text-[#786455]">
                    Works with Apple, Google, and Outlook calendars.
                  </p>
                </div>
              </div>
              <Button
                className="w-full bg-[#EC9247] text-[#1F1208] hover:bg-[#EC9247]/90"
                disabled={!reportUrls.ics || downloading === "ics"}
                onClick={() => download("ics")}
              >
                {downloading === "ics" ? (
                  <Clock className="mr-2 size-4 animate-spin" />
                ) : (
                  <Download className="mr-2 size-4" />
                )}
                Export calendar
              </Button>
              {mounted && reportUrls.ics && (
                <Button
                  variant="outline"
                  nativeButton={false}
                  className="w-full border-[#B49F90]/30 text-[#331D01]"
                  render={
                    <a
                      href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(
                        `${window.location.origin}/api/reading/${reading.id}/download?type=ics`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <Calendar className="mr-2 size-4" />
                  Add to Google Calendar
                </Button>
              )}
            </CardContent>
          </Card>
          )}

          <Card className="border-0 bg-white shadow-sm ring-1 ring-[#B49F90]/20">
            <CardHeader>
              <CardTitle className="text-[#1F1208]">Focus areas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {reading.focusAreas?.length ? (
                  reading.focusAreas.map((area) => (
                    <Badge
                      key={area}
                      variant="secondary"
                      className="bg-[#F6F1EC] text-[#331D01]"
                    >
                      {FOCUS_LABELS[area] || area}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-[#786455]">All areas</span>
                )}
              </div>
            </CardContent>
          </Card>

          {!sample && (
            <>
              <Card className="border-0 bg-white shadow-sm ring-1 ring-[#B49F90]/20">
                <CardHeader>
                  <CardTitle className="text-[#1F1208]">Downloads</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start border-[#B49F90]/30 text-[#331D01]"
                    disabled={!reportUrls.docx || downloading === "docx"}
                    onClick={() => download("docx")}
                  >
                    <FileText className="mr-2 size-4" />
                    Word document
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start border-[#B49F90]/30 text-[#331D01]"
                    disabled={!reportUrls.pdf || downloading === "pdf"}
                    onClick={() => download("pdf")}
                  >
                    <Download className="mr-2 size-4" />
                    PDF report
                  </Button>
                </CardContent>
              </Card>

              <Separator className="bg-[#B49F90]/20" />

              <p className="text-center text-xs text-[#786455]">
                Reading expires on{" "}
                <span className="text-[#331D01]">
                  {formatDate(reading.expiresAt)}
                </span>
              </p>
            </>
          )}
        </aside>
      </div>

      {/* Mobile section jump bar — the page is very long on small screens. */}
      <nav
        aria-label="Section navigation"
        className="sticky bottom-0 z-40 border-t border-[#B49F90]/20 bg-[#F6F1EC]/95 px-4 py-3 backdrop-blur-md lg:hidden"
      >
        <select
          aria-label="Jump to section"
          className="h-11 w-full rounded-lg border border-[#B49F90]/30 bg-white px-3 text-sm text-[#331D01]"
          value=""
          onChange={(event) => {
            if (event.target.value) scrollTo(event.target.value)
          }}
        >
          <option value="" disabled>
            Jump to a section…
          </option>
          {navItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </nav>

      <footer className="border-t border-[#B49F90]/20 px-6 py-6 text-center">
        <p className="text-xs text-[#786455]">
          Generated by SoliVana AI. For reflection and education — not fate,
          and not advice. Your data is never sold or shared.
        </p>
      </footer>
    </main>
  )
}
