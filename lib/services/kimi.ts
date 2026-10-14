import OpenAI from "openai"

export const MODEL = process.env.AI_MODEL ?? "claude-sonnet-4-6"
const TEMPERATURE = 0.7
const SECTION_MAX_TOKENS = 8000
const SYNTHESIS_MAX_TOKENS = 12000

// Anthropic exposes an OpenAI-compatible endpoint, so the openai SDK works
// unchanged — only the base URL, key, and model differ.
const openai = new OpenAI({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: "https://api.anthropic.com/v1/",
})

function ensureApiKey(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured. Set the ANTHROPIC_API_KEY environment variable to use the Anthropic / Claude API.",
    )
  }
}

export interface GenerationResult {
  content: string
  tokensUsed: number
}

async function createCompletion(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<GenerationResult> {
  ensureApiKey()

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: TEMPERATURE,
    max_tokens: maxTokens,
  })

  const content = response.choices[0]?.message?.content ?? ""
  const tokensUsed = response.usage?.total_tokens ?? 0

  return { content, tokensUsed }
}

export async function generateSection(
  systemPrompt: string,
  userPrompt: string,
): Promise<GenerationResult> {
  return createCompletion(systemPrompt, userPrompt, SECTION_MAX_TOKENS)
}

export async function synthesizeReport(
  systemPrompt: string,
  userPrompt: string,
): Promise<GenerationResult> {
  return createCompletion(systemPrompt, userPrompt, SYNTHESIS_MAX_TOKENS)
}
