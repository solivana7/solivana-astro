"use client"

import * as React from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Check, ChevronDown, Globe } from "lucide-react"

// Used only when Intl.supportedValuesOf is unavailable (very old browsers).
const FALLBACK_TIMEZONES = [
  "UTC",
  "America/Anchorage",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Toronto",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Kolkata",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Moscow",
  "Europe/Paris",
  "Pacific/Auckland",
]

/** All IANA timezones known to the user's browser (the standard list). */
export function getAllTimezones(): string[] {
  try {
    const zones = Intl.supportedValuesOf("timeZone")
    return zones.length ? [...zones] : FALLBACK_TIMEZONES
  } catch {
    return FALLBACK_TIMEZONES
  }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[_/]/g, " ").trim()
}

/** "Europe/Moscow" -> "Moscow" (the IANA id's city component). */
function cityName(zone: string): string {
  const last = zone.split("/").pop() ?? zone
  return last.replace(/_/g, " ")
}

/** Live UTC offset label for a zone, e.g. "UTC+3" or "UTC-5:30". */
function offsetLabel(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date())
    const name = parts.find((part) => part.type === "timeZoneName")?.value
    return name ? name.replace("GMT", "UTC") : ""
  } catch {
    return ""
  }
}

function formatZone(zone: string): string {
  const offset = offsetLabel(zone)
  return offset ? `${cityName(zone)} (${offset})` : cityName(zone)
}

const MAX_VISIBLE = 50

interface TimezoneSelectProps {
  id?: string
  value: string
  onChange: (timezone: string) => void
}

export function TimezoneSelect({ id, value, onChange }: TimezoneSelectProps) {
  const zones = React.useMemo(() => getAllTimezones(), [])
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const filtered = React.useMemo(() => {
    const needle = normalize(query)
    if (!needle) return zones
    return zones.filter((zone) => normalize(zone).includes(needle))
  }, [zones, query])

  const visible = React.useMemo(
    () => filtered.slice(0, MAX_VISIBLE),
    [filtered],
  )

  React.useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  // Keep the keyboard-highlighted option visible inside the scrollable list.
  React.useEffect(() => {
    if (open && highlightedIndex >= 0) {
      document
        .getElementById(`timezone-option-${highlightedIndex}`)
        ?.scrollIntoView({ block: "nearest" })
    }
  }, [highlightedIndex, open])

  const selectZone = (zone: string) => {
    onChange(zone)
    setQuery("")
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Globe className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[#B49F90]" />
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls="timezone-listbox"
          aria-autocomplete="list"
          aria-activedescendant={
            open && highlightedIndex >= 0
              ? `timezone-option-${highlightedIndex}`
              : undefined
          }
          value={open ? query : value ? formatZone(value) : ""}
          placeholder="Search your city or region..."
          autoComplete="off"
          className="pl-9 pr-8"
          onFocus={() => {
            setOpen(true)
            setQuery("")
            setHighlightedIndex(-1)
          }}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            setHighlightedIndex(event.target.value.trim() ? 0 : -1)
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault()
              setOpen(false)
              return
            }
            if (!open || visible.length === 0) return
            if (event.key === "ArrowDown") {
              event.preventDefault()
              setHighlightedIndex((index) =>
                index >= visible.length - 1 ? 0 : index + 1,
              )
            } else if (event.key === "ArrowUp") {
              event.preventDefault()
              setHighlightedIndex((index) =>
                index <= 0 ? visible.length - 1 : index - 1,
              )
            } else if (event.key === "Enter") {
              event.preventDefault()
              // Only an explicit highlight may be chosen — never silently
              // replace the value with the first zone in the list.
              if (highlightedIndex >= 0) {
                selectZone(visible[highlightedIndex])
              }
            }
          }}
        />
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-[#B49F90]" />
      </div>

      {open && (
        <div
          id="timezone-listbox"
          role="listbox"
          aria-label="Timezone suggestions"
          className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[#B49F90]/30 bg-white py-1 shadow-lg"
        >
          {visible.length === 0 ? (
            <div className="px-3 py-2 text-sm text-[#786455]">
              No matching timezone.
            </div>
          ) : (
            <>
              {visible.map((zone, index) => (
                <div
                  key={zone}
                  id={`timezone-option-${index}`}
                  role="option"
                  aria-selected={zone === value}
                  onClick={() => selectZone(zone)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#F6F1EC]",
                    index === highlightedIndex && "bg-[#F6F1EC]",
                  )}
                  tabIndex={-1}
                >
                  <span>{formatZone(zone)}</span>
                  {zone === value && (
                    <Check className="size-4 text-[#EC9247]" />
                  )}
                </div>
              ))}
              {filtered.length > MAX_VISIBLE && (
                <div className="px-3 py-2 text-xs text-[#786455]">
                  {filtered.length - MAX_VISIBLE} more — keep typing to narrow
                  down
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
