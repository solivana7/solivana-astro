"use client"

import { useEffect } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"

// Global error boundary: no raw errors ever reach users.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F6F1EC] px-6">
      <div className="max-w-md text-center">
        <p className="text-xs font-medium tracking-[0.3em] text-[#EC9247] uppercase">
          Something went quiet
        </p>
        <h1 className="font-heading mt-3 text-3xl font-medium text-[#1F1208]">
          An unexpected interruption
        </h1>
        <p className="mt-3 text-[#786455]">
          Nothing on your end caused this, and nothing is lost. Take a breath
          and try again.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Button
            onClick={reset}
            className="bg-[#EC9247] text-[#1F1208] hover:bg-[#d97e35]"
          >
            Try again
          </Button>
          <Link
            href="/"
            className="text-sm text-[#786455] underline decoration-[#EC9247]/60 underline-offset-4 hover:text-[#331D01]"
          >
            Return home
          </Link>
        </div>
      </div>
    </main>
  )
}
