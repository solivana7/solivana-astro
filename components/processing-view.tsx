"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress, ProgressValue } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import {
  Sparkles,
  Compass,
  Orbit,
  PenLine,
  ScrollText,
  FileDown,
  Loader2,
  AlertCircle,
} from "lucide-react"

interface StatusResponse {
  status: "processing" | "completed" | "failed"
  progress: number
  currentStep: string | null
  reportUrls: {
    docx: string | null
    pdf: string | null
    ics: string | null
  }
  error: string | null
}

const STEPS = [
  { label: "Birth data received", icon: Sparkles },
  { label: "Calculating natal chart", icon: Compass },
  { label: "Rendering chart wheels", icon: Orbit },
  { label: "Generating interpretations", icon: PenLine },
  { label: "Synthesizing master report", icon: ScrollText },
  { label: "Generating report exports", icon: FileDown },
]

// Rotating facts shown during the wait — true, on-brand, no claims about people.
const FACTS = [
  "Your Moon moves about 13 degrees every day — the fastest body in your chart.",
  "We searched 34,025 cities to pinpoint your birthplace.",
  "Your dasha timeline runs 120 years. We're reading where you stand in it.",
  "The Vedic and Western zodiacs differ by about 24 degrees — we read both, never mixed.",
  "Six lenses are reading your chart right now: purpose, abundance, vitality, love, career, timing.",
  "A natal chart is a photograph of the sky at one exact minute — yours.",
  "The Atmakaraka, your soul planet, is the planet furthest along its sign.",
  "Nakshatras divide the sky into 27 lunar mansions, each with its own ruler.",
  "Your report is written for your chart alone. No two are the same.",
  "Placidus houses split your sky into twelve arenas of life — love, work, home, self.",
  "Every auspicious window is checked against your dasha lords before your calendar is written.",
  "Your reading lives for 30 days — long enough to return to when you need it.",
]

type StepKey =
  | "received"
  | "calculating_chart"
  | "rendering_charts"
  | "generating_sections"
  | "synthesizing"
  | "generating_exports"
  | "finalizing"

const STEP_LABELS: Record<StepKey, string> = {
  received: "Birth data received",
  calculating_chart: "Calculating natal chart",
  rendering_charts: "Rendering chart wheels",
  generating_sections: "Generating interpretations",
  synthesizing: "Synthesizing master report",
  generating_exports: "Generating report exports",
  finalizing: "Finalizing your reading",
}

const STEP_INDEX_BY_KEY: Record<StepKey, number> = {
  received: 0,
  calculating_chart: 1,
  rendering_charts: 2,
  generating_sections: 3,
  synthesizing: 4,
  generating_exports: 5,
  finalizing: 5,
}

export function ProcessingView({ readingId }: { readingId: string }) {
  const router = useRouter()
  const [status, setStatus] = React.useState<StatusResponse | null>(null)
  const [retrying, setRetrying] = React.useState(false)
  const [retryError, setRetryError] = React.useState<string | null>(null)
  const [pollError, setPollError] = React.useState<string | null>(null)
  const [factIndex, setFactIndex] = React.useState(0)
  const statusRef = React.useRef(status)

  React.useEffect(() => {
    statusRef.current = status
  })

  // Rotate the waiting-room facts while the pipeline runs.
  React.useEffect(() => {
    const id = setInterval(
      () => setFactIndex((i) => (i + 1) % FACTS.length),
      6000,
    )
    return () => clearInterval(id)
  }, [])

  async function handleRetry() {
    setRetrying(true)
    setRetryError(null)
    try {
      const res = await fetch(`/api/reading/${readingId}/retry`, {
        method: "POST",
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(json?.error ?? `Retry failed (${res.status})`)
      }
      // Polling stopped when the reading failed; reload to resume it.
      window.location.reload()
    } catch (error) {
      setRetryError(
        error instanceof Error ? error.message : "Retry failed. Try again.",
      )
      setRetrying(false)
    }
  }

  React.useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let abortController: AbortController | null = null

    async function poll() {
      let terminal =
        statusRef.current?.status === "completed" ||
        statusRef.current?.status === "failed"
      abortController = new AbortController()

      try {
        const res = await fetch(`/api/reading/${readingId}/status`, {
          signal: abortController.signal,
        })

        if (cancelled) return

        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`)
        }

        const data = (await res.json()) as StatusResponse

        if (cancelled) return

        terminal = data.status === "completed" || data.status === "failed"
        setStatus(data)
        setPollError(null)
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        if (cancelled) return

        // A transient poll failure (network hiccup, brief 5xx) is not a
        // failed reading — keep polling and show a reconnecting hint.
        setPollError("Connection hiccup — retrying…")
      } finally {
        abortController = null

        if (!cancelled && !terminal) {
          timeoutId = setTimeout(poll, 3000)
        }
      }
    }

    poll()

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      abortController?.abort()
    }
  }, [readingId])

  React.useEffect(() => {
    if (status?.status === "completed") {
      const timeout = setTimeout(() => {
        router.push(`/reading/${readingId}`)
      }, 800)
      return () => clearTimeout(timeout)
    }
  }, [status, readingId, router])

  const activeIndex = React.useMemo(() => {
    if (!status?.currentStep) return 0
    const key = status.currentStep as StepKey
    if (key in STEP_INDEX_BY_KEY) {
      return STEP_INDEX_BY_KEY[key]
    }
    return 0
  }, [status])

  const currentStepLabel = React.useMemo(() => {
    if (!status?.currentStep) return "Starting reading"
    const key = status.currentStep as StepKey
    return STEP_LABELS[key] ?? status.currentStep
  }, [status])

  const progress = status?.progress ?? 0
  const isFailed = status?.status === "failed"

  return (
    <Card className="mx-auto w-full max-w-2xl border-0 bg-white/80 shadow-xl ring-1 ring-[#B49F90]/20 backdrop-blur-sm">
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isFailed ? "Reading failed." : `Current step: ${currentStepLabel}.`}
      </div>
      <CardHeader className="text-center">
        <CardTitle className="text-[#1F1208]">
          {isFailed ? "The sky stalled" : "Weaving your cosmic story"}
        </CardTitle>
        <CardDescription className="text-[#786455]">
          {isFailed
            ? "Something interrupted your reading. Nothing was lost — try again."
            : "Two to three minutes while the sky does its work. Keep this page open — it's worth the wait."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        {isFailed ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertCircle className="size-8" />
            </div>
            <p className="max-w-sm text-sm text-[#786455]">
              {status?.error ||
                "We couldn't complete your reading right now. Please try again later."}
            </p>
            <Button
              onClick={handleRetry}
              disabled={retrying}
              variant="outline"
              className="border-[#B49F90]/30 text-[#331D01]"
            >
              {retrying ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Retrying…
                </>
              ) : (
                "Retry"
              )}
            </Button>
            {retryError ? (
              <p className="text-sm text-red-600">{retryError}</p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-[#B49F90]/20 bg-white/60 px-4 py-3 text-center">
              <p className="text-xs font-medium tracking-[0.2em] text-[#9C5A1A] uppercase">
                While you wait
              </p>
              <p
                key={factIndex}
                aria-live="polite"
                className="mt-1 text-sm leading-relaxed text-[#331D01]"
              >
                {FACTS[factIndex]}
              </p>
            </div>

            <div className="text-center">
              <p className="font-heading text-6xl font-medium text-[#1F1208]">
                {progress > 0 ? (
                  `${progress}%`
                ) : (
                  <span className="animate-pulse">…</span>
                )}
              </p>
              <p className="mt-1 text-xs tracking-[0.25em] text-[#786455] uppercase">
                {currentStepLabel}
              </p>
            </div>

            <Progress
              value={progress}
              className="[&_[data-slot=progress-indicator]]:bg-[#EC9247]"
            >
              <ProgressValue />
            </Progress>

            {pollError && (
              <p className="text-center text-xs text-[#786455]">{pollError}</p>
            )}

            <div className="grid gap-3">
              {STEPS.map((step, idx) => {
                const Icon = step.icon
                const active = idx === activeIndex
                const completed = idx < activeIndex

                return (
                  <div
                    key={step.label}
                    className={cn(
                      "flex items-center gap-4 rounded-xl border px-4 py-3 transition-all",
                      active
                        ? "border-[#EC9247]/40 bg-[#EC9247]/10"
                        : completed
                          ? "border-[#C8A45C]/30 bg-[#C8A45C]/10"
                          : "border-[#B49F90]/20 bg-white/50"
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
                        active
                          ? "bg-[#EC9247] text-[#1F1208]"
                          : completed
                            ? "bg-[#C8A45C] text-[#1F1208]"
                            : "bg-[#F6F1EC] text-[#B49F90]"
                      )}
                    >
                      {active && !isFailed ? (
                        <Loader2 className="size-5 animate-spin" />
                      ) : (
                        <Icon className="size-5" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p
                        className={cn(
                          "text-sm font-medium",
                          active
                            ? "text-[#331D01]"
                            : completed
                              ? "text-[#331D01]"
                              : "text-[#786455]"
                        )}
                      >
                        {step.label}
                      </p>
                    </div>
                    {completed && (
                      <span className="text-xs font-medium text-[#786455]">
                        Done
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
