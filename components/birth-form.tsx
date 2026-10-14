"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { TimezoneSelect, getAllTimezones } from "@/components/timezone-select"
import {
  ChevronRight,
  ChevronLeft,
  MapPin,
  Loader2,
  Sparkles,
  User,
  Mail,
  Calendar,
  Clock,
  Target,
  Check,
} from "lucide-react"

const FOCUS_AREAS = [
  { value: "life_purpose", label: "Life Purpose" },
  { value: "finances", label: "Finances & Abundance" },
  { value: "health", label: "Health & Vitality" },
  { value: "relationships", label: "Relationships" },
  { value: "business", label: "Business & Career" },
  { value: "timing", label: "Timing & Transits" },
] as const

type FocusArea = (typeof FOCUS_AREAS)[number]["value"]

interface GeocodeResult {
  name: string
  lat: number
  lon: number
  timezone?: string
}

interface FormData {
  name: string
  email: string
  birthDate: string
  birthTime: string
  timezone: string
  locationName: string
  lat: number | null
  lon: number | null
  unknownTime: boolean
  focusAreas: FocusArea[]
}

const STEPS = [
  { label: "About you", icon: User },
  { label: "Birth moment", icon: Calendar },
  { label: "Location", icon: MapPin },
  { label: "Focus areas", icon: Target },
]

// Payments (Stripe Payment Link, same pattern as PetView). When no link is
// configured the form runs in free mode — used by dev, tests, and /sample.
const STRIPE_PAYMENT_LINK = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK
const PRICE_LABEL = process.env.NEXT_PUBLIC_KARMIC_PRICE ?? ""
const TOKEN_KEY = "ki:payment-token"
const DRAFT_KEY = "ki:birth-form-draft"

export function BirthForm() {
  const router = useRouter()
  const [step, setStep] = React.useState(1)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [paidConfirmed, setPaidConfirmed] = React.useState(false)

  const [form, setForm] = React.useState<FormData>(() => ({
    name: "",
    email: "",
    birthDate: "",
    birthTime: "12:00",
    timezone: "UTC",
    locationName: "",
    lat: null,
    lon: null,
    unknownTime: false,
    focusAreas: FOCUS_AREAS.map((f) => f.value),
  }))

  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (typeof Intl !== "undefined") {
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (detected && getAllTimezones().includes(detected)) {
          setForm((prev) => ({ ...prev, timezone: detected }))
        }
      }
      // Welcome back: prefill name/email from the last visit (local only).
      try {
        const saved = window.localStorage.getItem("ki:birth-form")
        if (saved) {
          const { name, email } = JSON.parse(saved) as {
            name?: string
            email?: string
          }
          setForm((prev) => ({
            ...prev,
            name: name ?? prev.name,
            email: email ?? prev.email,
          }))
        }
      } catch {
        // localStorage unavailable — no prefill
      }
    }, 0)

    return () => clearTimeout(timeoutId)
  }, [])

  // Return trip from Stripe: confirm the checkout server-side, stash the
  // one-use token, restore the form draft, and clean the URL.
  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const sessionId = params.get("session_id")

      const draft = window.localStorage.getItem(DRAFT_KEY)
      if (draft) {
        const parsed = JSON.parse(draft) as Partial<FormData>
        setForm((prev) => ({ ...prev, ...parsed }))
        window.localStorage.removeItem(DRAFT_KEY)
      }

      if (!sessionId) return
      fetch(
        `/api/reading/verify-payment?session_id=${encodeURIComponent(sessionId)}`,
      )
        .then((res) => {
          if (!res.ok) throw new Error("verify failed")
          window.localStorage.setItem(TOKEN_KEY, sessionId)
          window.history.replaceState(null, "", window.location.pathname)
          // Land on the last step with a clear confirmation — the whole point
          // of the round trip is one more click, not a restart.
          setPaidConfirmed(true)
          setStep(STEPS.length)
        })
        .catch(() => {
          setError(
            "We couldn't confirm your payment — please contact us with your receipt and we'll make it right.",
          )
        })
    } catch {
      // localStorage unavailable — payment flow disabled
    }
  }, [])

  const [query, setQuery] = React.useState(form.locationName)
  const [results, setResults] = React.useState<GeocodeResult[]>([])
  const [geocoding, setGeocoding] = React.useState(false)
  const [showResults, setShowResults] = React.useState(false)
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1)
  const [tzFromCity, setTzFromCity] = React.useState<string | null>(null)

  const contentRef = React.useRef<HTMLDivElement>(null)
  const locationRef = React.useRef<HTMLDivElement>(null)

  // Close the location dropdown when clicking outside of it.
  React.useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (
        locationRef.current &&
        !locationRef.current.contains(event.target as Node)
      ) {
        setShowResults(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  // Move focus to the first field when the step changes, and announce it.
  React.useEffect(() => {
    const first = contentRef.current?.querySelector<HTMLElement>(
      "input:not([disabled]), button:not([disabled])",
    )
    first?.focus()
  }, [step])

  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const abortRef = React.useRef<AbortController | null>(null)
  const skipGeocodeRef = React.useRef(false)

  React.useEffect(() => {
    if (skipGeocodeRef.current) {
      skipGeocodeRef.current = false
      return
    }

    clearTimeout(debounceRef.current)
    abortRef.current?.abort()

    if (!query.trim()) return
    if (query.trim() === form.locationName.trim()) return

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (!res.ok) throw new Error("Geocoding failed")
        const data = (await res.json()) as GeocodeResult[]
        setResults(data)
        setHighlightedIndex(data.length > 0 ? 0 : -1)
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        setResults([])
        setHighlightedIndex(-1)
      } finally {
        if (abortRef.current === controller) {
          setGeocoding(false)
        }
      }
    }, 400)

    return () => {
      clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [query, form.locationName])

  const update = React.useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  const toggleFocusArea = (value: FocusArea) => {
    setForm((prev) => {
      const exists = prev.focusAreas.includes(value)
      const next = exists
        ? prev.focusAreas.filter((v) => v !== value)
        : [...prev.focusAreas, value]
      return { ...prev, focusAreas: next.length ? next : prev.focusAreas }
    })
  }

  const selectLocation = (result: GeocodeResult) => {
    skipGeocodeRef.current = true
    setForm((prev) => ({
      ...prev,
      locationName: result.name,
      lat: result.lat,
      lon: result.lon,
      // Dataset cities carry their IANA timezone — adopt it (still editable
      // back on step 2 if the user knows better).
      ...(result.timezone ? { timezone: result.timezone } : {}),
    }))
    setTzFromCity(result.timezone ?? null)
    setQuery(result.name)
    setShowResults(false)
  }

  const validateStep = (): boolean => {
    setError(null)
    if (step === 1) {
      if (!form.name.trim()) return (setError("Please enter your name."), false)
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
      if (!emailOk) return (setError("Please enter a valid email."), false)
    }
    if (step === 2) {
      if (!form.birthDate)
        return (setError("Please enter your birth date."), false)
      if (!form.unknownTime && !form.birthTime)
        return (
          setError("Please enter your birth time or check Unknown time."),
          false
        )
      if (!form.timezone) return (setError("Please select a timezone."), false)
    }
    if (step === 3) {
      if (!form.locationName || form.lat == null || form.lon == null)
        return (
          setError("Please select a location from the suggestions."),
          false
        )
    }
    return true
  }

  const next = () => {
    if (!validateStep()) return
    setStep((s) => Math.min(s + 1, STEPS.length))
  }

  const prev = () => setStep((s) => Math.max(s - 1, 1))

  const submit = async () => {
    if (!validateStep()) return

    // Paywall: when payments are configured, a reading starts at Stripe.
    // The form draft survives the round trip via localStorage.
    let paymentToken: string | null = null
    if (STRIPE_PAYMENT_LINK) {
      try {
        paymentToken = window.localStorage.getItem(TOKEN_KEY)
      } catch {
        paymentToken = null
      }
      if (!paymentToken) {
        try {
          window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form))
        } catch {
          // draft is a nicety, not a requirement
        }
        const url = new URL(STRIPE_PAYMENT_LINK)
        if (form.email.trim()) {
          url.searchParams.set("prefilled_email", form.email.trim())
        }
        window.location.href = url.toString()
        return
      }
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/reading/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          birthDate: form.birthDate,
          birthTime: form.unknownTime ? "12:00" : form.birthTime,
          timezone: form.timezone,
          locationName: form.locationName,
          lat: form.lat,
          lon: form.lon,
          unknownTime: form.unknownTime,
          focusAreas: form.focusAreas,
          paymentToken: paymentToken ?? undefined,
        }),
      })

      if (res.status === 402) {
        // Token missing or already spent — send them back to checkout.
        try {
          window.localStorage.removeItem(TOKEN_KEY)
        } catch {
          // ignore
        }
        setSubmitting(false)
        setError(
          "That payment has already been used. Please purchase a new reading to continue.",
        )
        return
      }

      const data = (await res.json()) as { readingId?: string; error?: string }
      if (!res.ok || !data.readingId) {
        throw new Error(data.error || "Failed to create reading")
      }

      try {
        window.localStorage.removeItem(TOKEN_KEY)
      } catch {
        // ignore
      }

      // Remember the basics for next time (stays on this device).
      try {
        window.localStorage.setItem(
          "ki:birth-form",
          JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim(),
          }),
        )
      } catch {
        // localStorage unavailable — ignore
      }

      router.push(`/reading/${data.readingId}/processing`)
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : "Something went wrong")
    }
  }

  return (
    <Card className="mx-auto w-full max-w-xl border-0 bg-white/80 shadow-xl ring-1 ring-[#B49F90]/20 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="mb-4 flex items-center justify-between" role="list">
          {STEPS.map((s, idx) => {
            const active = idx + 1 === step
            const completed = idx + 1 < step
            return (
              <div
                key={s.label}
                role="listitem"
                aria-current={active ? "step" : undefined}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                    active && "bg-[#EC9247] text-[#1F1208]",
                    completed && "bg-[#C8A45C] text-[#1F1208]",
                    !active && !completed && "bg-[#F6F1EC] text-[#786455]"
                  )}
                >
                  {completed ? <Check className="size-4" /> : idx + 1}
                </div>
                <span
                  className={cn(
                    "hidden text-xs sm:block",
                    active ? "text-[#1F1208]" : "text-[#786455]"
                  )}
                >
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>
        <CardTitle className="text-[#1F1208]">
          Begin your cosmic reading
        </CardTitle>
        <CardDescription className="text-[#786455]">
          {PRICE_LABEL
            ? `One payment of ${PRICE_LABEL} — your chart, six readings, 30 days of access.`
            : "A few details, then the sky does the talking."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5" ref={contentRef}>
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          Step {step} of {STEPS.length}: {STEPS[step - 1].label}
        </div>
        {paidConfirmed && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-xl border border-[#C8A45C]/40 bg-[#C8A45C]/10 px-4 py-3"
          >
            <Check className="size-5 shrink-0 text-[#9C5A1A]" aria-hidden="true" />
            <p className="text-sm font-medium text-[#331D01]">
              Payment confirmed — your details are still here. One click and
              your chart is cast.
            </p>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-[#331D01]">
                Name
              </Label>
              <div className="relative">
                <User className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[#B49F90]" />
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[#331D01]">
                Email
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[#B49F90]" />
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="you@example.com"
                  className="pl-9"
                />
              </div>
              <p className="text-xs leading-relaxed text-[#786455]">
                Your details build your reading and deliver it by email.
                Nothing sold, nothing shared. Readings expire after 30 days.
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="birthDate" className="text-[#331D01]">
                Birth date
              </Label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[#B49F90]" />
                <Input
                  id="birthDate"
                  type="date"
                  min="1900-01-01"
                  max={new Date().toISOString().slice(0, 10)}
                  value={form.birthDate}
                  onChange={(e) => update("birthDate", e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="birthTime" className="text-[#331D01]">
                Birth time
              </Label>
              <div className="relative">
                <Clock className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[#B49F90]" />
                <Input
                  id="birthTime"
                  type="time"
                  value={form.birthTime}
                  disabled={form.unknownTime}
                  onChange={(e) => update("birthTime", e.target.value)}
                  className="pl-9 disabled:opacity-50"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="unknownTime"
                  checked={form.unknownTime}
                  onCheckedChange={(checked) => {
                    update("unknownTime", checked === true)
                    if (checked === true) update("birthTime", "12:00")
                  }}
                />
                <Label
                  htmlFor="unknownTime"
                  className="text-sm font-normal text-[#786455]"
                >
                  I don&apos;t know my exact birth time (defaults to 12:00)
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone" className="text-[#331D01]">
                Birth timezone
              </Label>
              <TimezoneSelect
                id="timezone"
                value={form.timezone}
                onChange={(timezone) => update("timezone", timezone)}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div ref={locationRef} className="relative space-y-2">
              <Label htmlFor="location" className="text-[#331D01]">
                Birth location
              </Label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[#B49F90]" />
                <Input
                  id="location"
                  value={query}
                  role="combobox"
                  aria-expanded={showResults}
                  aria-haspopup="listbox"
                  aria-controls="location-listbox"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    showResults && highlightedIndex >= 0
                      ? `location-option-${highlightedIndex}`
                      : undefined
                  }
                  onChange={(e) => {
                    const value = e.target.value
                    setQuery(value)
                    // Editing the text after a selection invalidates the
                    // previously chosen coordinates.
                    if (
                      form.locationName &&
                      value.trim() !== form.locationName.trim()
                    ) {
                      setForm((prev) => ({
                        ...prev,
                        locationName: "",
                        lat: null,
                        lon: null,
                      }))
                      setTzFromCity(null)
                    }
                    if (value.trim()) {
                      setShowResults(true)
                      setGeocoding(true)
                    } else {
                      setShowResults(false)
                      setResults([])
                      setGeocoding(false)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault()
                      setShowResults(false)
                      return
                    }
                    if (!showResults || results.length === 0) return
                    if (e.key === "ArrowDown") {
                      e.preventDefault()
                      setHighlightedIndex((idx) =>
                        idx >= results.length - 1 ? 0 : idx + 1
                      )
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault()
                      setHighlightedIndex((idx) =>
                        idx <= 0 ? results.length - 1 : idx - 1
                      )
                    } else if (e.key === "Enter") {
                      e.preventDefault()
                      if (highlightedIndex >= 0) {
                        selectLocation(results[highlightedIndex])
                      }
                    }
                  }}
                  placeholder="Start typing a city..."
                  className="pl-9"
                  autoComplete="off"
                />
              </div>
              {showResults && (
                <div
                  id="location-listbox"
                  role="listbox"
                  aria-label="Location suggestions"
                  className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[#B49F90]/30 bg-white py-1 shadow-lg"
                >
                  {geocoding ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-[#786455]">
                      <Loader2 className="size-4 animate-spin" />
                      Searching...
                    </div>
                  ) : results.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-[#786455]">
                      No results found.
                    </div>
                  ) : (
                    results.map((result, index) => (
                      <div
                        key={result.name}
                        id={`location-option-${index}`}
                        role="option"
                        aria-selected={form.locationName === result.name}
                        onClick={() => selectLocation(result)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={cn(
                          "w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-[#F6F1EC] focus:bg-[#F6F1EC]",
                          index === highlightedIndex && "bg-[#F6F1EC]"
                        )}
                        tabIndex={-1}
                      >
                        {result.name}
                      </div>
                    ))
                  )}
                </div>
              )}
              {form.locationName && (
                <p className="text-xs text-[#786455]">
                  Selected:{" "}
                  <span className="text-[#331D01]">{form.locationName}</span>
                </p>
              )}
              {tzFromCity && form.timezone === tzFromCity && (
                <p className="text-xs text-[#786455]">
                  Timezone auto-set to {tzFromCity.replace(/_/g, " ")} from
                  your city — you can change it on the previous step.
                </p>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <fieldset className="space-y-4">
            <legend className="text-sm font-medium text-[#331D01]">
              What would you like to focus on?
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FOCUS_AREAS.map((area) => {
                const selected = form.focusAreas.includes(area.value)
                return (
                  <button
                    key={area.value}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    aria-label={area.label}
                    onClick={() => toggleFocusArea(area.value)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all",
                      selected
                        ? "border-[#EC9247] bg-[#EC9247]/10 text-[#331D01]"
                        : "border-[#B49F90]/30 bg-white text-[#786455] hover:bg-[#F6F1EC]"
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-5 items-center justify-center rounded border text-[10px]",
                        selected
                          ? "border-[#EC9247] bg-[#EC9247] text-white"
                          : "border-[#B49F90]/50"
                      )}
                    >
                      {selected && <Check className="size-3" />}
                    </div>
                    {area.label}
                  </button>
                )
              })}
            </div>
          </fieldset>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </CardContent>

      <CardFooter className="flex justify-between border-t border-[#B49F90]/20 bg-[#F6F1EC]/50">
        <Button
          variant="ghost"
          onClick={prev}
          disabled={step === 1}
          className="text-[#786455] hover:bg-[#F6F1EC]"
        >
          <ChevronLeft className="mr-1 size-4" />
          Back
        </Button>

        {step < STEPS.length ? (
          <Button
            onClick={next}
            className="bg-[#1F1208] text-[#F6F1EC] hover:bg-[#331D01]"
          >
            Next
            <ChevronRight className="ml-1 size-4" />
          </Button>
        ) : (
          <Button
            onClick={submit}
            disabled={submitting}
            className="bg-[#EC9247] text-[#1F1208] hover:bg-[#EC9247]/90"
          >
            {submitting ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1 size-4" />
            )}
            {paidConfirmed
              ? "Cast my chart"
              : STRIPE_PAYMENT_LINK && PRICE_LABEL
                ? `Cast my chart — ${PRICE_LABEL}`
                : "Cast my chart"}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
