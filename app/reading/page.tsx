import { BirthForm } from "@/components/birth-form"
import { SiteHeader } from "@/components/site-header"

export default function ReadingPage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-[#F6F1EC] px-6 py-12 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <h1 className="font-heading text-3xl font-medium tracking-tight text-[#1F1208] sm:text-4xl">
            Create your reading
          </h1>
          <p className="mt-2 text-[#786455]">
            Tell us your birth details and we&apos;ll build your cosmic
            blueprint.
          </p>
        </div>
        <BirthForm />
      </div>
    </main>
    </>
  )
}
