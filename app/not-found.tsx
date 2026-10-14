import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F6F1EC] px-6">
      <div className="text-center">
        <p className="text-xs font-medium tracking-[0.3em] text-[#EC9247] uppercase">
          404
        </p>
        <h1 className="font-heading mt-3 text-3xl font-medium text-[#1F1208]">
          This page drifted off the map
        </h1>
        <p className="mt-3 text-[#786455]">
          The link may be broken, or the page has expired.
        </p>
        <Button
          nativeButton={false}
          className="mt-8 bg-[#EC9247] text-[#1F1208] hover:bg-[#d97e35]"
          render={<Link href="/" />}
        >
          Return home
        </Button>
      </div>
    </main>
  )
}
