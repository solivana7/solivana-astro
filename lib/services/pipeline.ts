import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { readings, reportSections, users } from "@/lib/db/schema"
import { getOrCalculateChart, type BirthData } from "./chart"
import { renderChartSvgs } from "@/lib/chart/svg"
import { generateSection, synthesizeReport, MODEL } from "./kimi"
import { generateDocx, generatePdf, generateIcs } from "./reports"
import { sendCompletionEmail } from "./email"
import { put } from "@vercel/blob"
import {
  SECTION_ORDER,
  sectionBuilders,
  sectionSystems,
  sectionTitles,
  buildSynthesisPrompt,
  synthesisSystem,
  type SectionType,
} from "@/lib/prompts"

function sanitizeErrorMessage(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim()
  return cleaned.slice(0, 500) || "Processing failed"
}

async function updateProgress(
  readingId: string,
  progress: number,
  currentStep: string,
): Promise<void> {
  await db
    .update(readings)
    .set({ progress, currentStep })
    .where(eq(readings.id, readingId))
}

/** Sleep in small slices so an abort signal interrupts promptly. */
async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  const step = 100
  let waited = 0
  while (waited < ms) {
    if (signal?.aborted) return
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(step, ms - waited)),
    )
    waited += step
  }
}

/** Retry an async step with linear backoff (transient LLM/API failures). */
async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 1000,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) {
      throw lastError ?? new Error("Aborted")
    }
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await sleepWithAbort(baseDelayMs * attempt, signal)
      }
    }
  }
  throw lastError
}

export async function runReadingPipeline(readingId: string): Promise<void> {
  let reading: typeof readings.$inferSelect | undefined = undefined

  try {
    reading = await db.query.readings.findFirst({
      where: eq(readings.id, readingId),
    })

    if (!reading) {
      throw new Error("Reading not found")
    }

    if (reading.status === "completed") {
      return
    }

    await db
      .update(readings)
      .set({ status: "processing" })
      .where(eq(readings.id, readingId))

    // 1. Calculate chart (10%)
    await updateProgress(readingId, 10, "calculating_chart")
    const birthData = reading.birthDataJson as BirthData
    const chartData = await getOrCalculateChart(birthData)

    await db
      .update(readings)
      .set({ chartDataJson: chartData })
      .where(eq(readings.id, readingId))

    // 2. Render chart wheels (20%)
    await updateProgress(readingId, 20, "rendering_charts")
    const chartSvgs = renderChartSvgs(chartData)
    await db
      .update(readings)
      .set({ chartSvgsJson: chartSvgs })
      .where(eq(readings.id, readingId))

    // 3. Generate interpretation sections in parallel (30%)
    await updateProgress(readingId, 30, "generating_sections")

    const focusAreas = reading.focusAreasJson as SectionType[] | undefined
    const sectionsToGenerate = focusAreas?.length
      ? SECTION_ORDER.filter((section) => focusAreas.includes(section))
      : SECTION_ORDER

    // When one section exhausts its retries, abort the others so their
    // remaining attempts don't burn tokens for an already-doomed reading.
    const abort = new AbortController()

    const sectionResults = await Promise.all(
      sectionsToGenerate.map(async (sectionType) => {
        try {
          const systemPrompt = sectionSystems[sectionType]
          const userPrompt = sectionBuilders[sectionType](chartData)
          const result = await withRetry(
            () => generateSection(systemPrompt, userPrompt),
            3,
            1000,
            abort.signal,
          )
          return {
            sectionType,
            title: sectionTitles[sectionType],
            content: result.content,
            tokensUsed: result.tokensUsed,
          }
        } catch (error) {
          abort.abort()
          throw error
        }
      }),
    )

    let totalTokens = sectionResults.reduce(
      (sum, section) => sum + section.tokensUsed,
      0,
    )

    await db.transaction(async (tx) => {
      await tx
        .delete(reportSections)
        .where(eq(reportSections.readingId, readingId))

      await tx.insert(reportSections).values(
        sectionResults.map((section) => ({
          readingId,
          sectionType: section.sectionType,
          title: section.title,
          content: section.content,
          tokensUsed: section.tokensUsed,
        })),
      )
    })

    await updateProgress(readingId, 60, "generating_sections")

    // 4. Synthesize master report (70%)
    await updateProgress(readingId, 70, "synthesizing")
    const synthesisInput = sectionResults.map((section) => ({
      sectionType: section.sectionType,
      content: section.content,
    }))
    const synthesis = await withRetry(() =>
      synthesizeReport(
        synthesisSystem,
        buildSynthesisPrompt(synthesisInput, chartData),
      ),
    )
    totalTokens += synthesis.tokensUsed

    // 5. Generate exports and upload to Blob (80%)
    await updateProgress(readingId, 80, "generating_exports")

    // Exports are best-effort: one failed generator or upload must not kill
    // an otherwise complete reading — the report text is the product.
    async function tryExport(
      label: string,
      fn: () => Promise<string>,
    ): Promise<string | null> {
      try {
        return await fn()
      } catch (error) {
        console.error(`Export ${label} failed for reading ${readingId}:`, error)
        return null
      }
    }

    const blobPrefix = `readings/${readingId}`
    const [docxUrl, pdfUrl, icsUrl] = await Promise.all([
      tryExport("docx", async () => {
        const buffer = await generateDocx(synthesis.content)
        const blob = await put(`${blobPrefix}/report.docx`, buffer, {
          access: "private",
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })
        return blob.url
      }),
      tryExport("pdf", async () => {
        const buffer = await generatePdf(synthesis.content)
        const blob = await put(`${blobPrefix}/report.pdf`, buffer, {
          access: "private",
          contentType: "application/pdf",
        })
        return blob.url
      }),
      tryExport("ics", async () => {
        const buffer = await generateIcs(synthesis.content, chartData)
        const blob = await put(`${blobPrefix}/events.ics`, buffer, {
          access: "private",
          contentType: "text/calendar",
        })
        return blob.url
      }),
    ])

    // 6. Finalize (100%)
    await updateProgress(readingId, 100, "finalizing")
    await db
      .update(readings)
      .set({
        status: "completed",
        progress: 100,
        currentStep: "finalizing",
        completedAt: new Date(),
        reportMarkdown: synthesis.content,
        reportDocxUrl: docxUrl,
        reportPdfUrl: pdfUrl,
        reportIcsUrl: icsUrl,
        tokensUsed: totalTokens,
        aiModel: MODEL,
      })
      .where(eq(readings.id, readingId))

    const user = await db.query.users.findFirst({
      where: eq(users.id, reading.userId),
    })
    if (user) {
      await sendCompletionEmail(user.email, user.name, readingId)
    }
  } catch (error) {
    console.error("Pipeline failed for reading", readingId, error)
    const message =
      error instanceof Error ? error.message : "Unexpected pipeline error"
    // Only fail a reading that is still in-flight — a stale/duplicate run
    // must never regress an already-completed reading.
    await db
      .update(readings)
      .set({
        status: "failed",
        currentStep: "Processing failed",
        errorMessage: sanitizeErrorMessage(message),
      })
      .where(
        and(eq(readings.id, readingId), eq(readings.status, "processing")),
      )
  }
}
