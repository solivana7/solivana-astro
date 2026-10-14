import { ProcessingView } from "@/components/processing-view"
import { SiteHeader } from "@/components/site-header"

export default async function ProcessingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <SiteHeader />
      <main className="flex min-h-screen items-center justify-center bg-[#F6F1EC] px-6 py-12">
        <ProcessingView readingId={id} />
      </main>
    </>
  )
}
