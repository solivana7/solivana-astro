import { Loader2 } from "lucide-react"

// Branded loading state while the reading result is fetched server-side.
export default function ReadingLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F6F1EC] px-6">
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-4 text-center"
      >
        <Loader2 className="size-8 animate-spin text-[#EC9247]" />
        <p className="font-heading text-lg text-[#1F1208]">
          Reading your chart…
        </p>
      </div>
    </main>
  )
}
