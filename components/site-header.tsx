import Link from "next/link"
import { Sparkles } from "lucide-react"

export function SiteHeader() {
  return (
    <header className="border-b border-[#B49F90]/20 bg-[#F6F1EC]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-[#1F1208]"
          aria-label="SoliVana Astro home"
        >
          <Sparkles className="size-5 text-[#EC9247]" aria-hidden="true" />
          <span className="font-heading text-lg font-medium tracking-wide">
            SoliVana Astro
          </span>
        </Link>
        <Link
          href="/reading"
          className="text-sm text-[#786455] hover:text-[#331D01]"
        >
          New reading
        </Link>
      </div>
    </header>
  )
}
