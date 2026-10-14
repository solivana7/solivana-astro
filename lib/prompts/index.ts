import { ChartData } from "@/lib/chart"
import {
  lifePurposeSystem,
  buildLifePurposePrompt,
} from "./life-purpose"
import {
  financesSystem,
  buildFinancesPrompt,
} from "./finances"
import {
  healthSystem,
  buildHealthPrompt,
} from "./health"
import {
  relationshipsSystem,
  buildRelationshipsPrompt,
} from "./relationships"
import {
  businessSystem,
  buildBusinessPrompt,
} from "./business"
import {
  timingSystem,
  buildTimingPrompt,
} from "./timing"
import {
  synthesisSystem,
  buildSynthesisPrompt,
  type SectionInput,
} from "./synthesis"

export type SectionType =
  | "life_purpose"
  | "finances"
  | "health"
  | "relationships"
  | "business"
  | "timing"

export const SECTION_ORDER: SectionType[] = [
  "life_purpose",
  "finances",
  "health",
  "relationships",
  "business",
  "timing",
]

export const sectionTitles: Record<SectionType, string> = {
  life_purpose: "Life Purpose & Soul Mission",
  finances: "Financial Karma & Abundance",
  health: "Health & Vitality",
  relationships: "Love & Relationships",
  business: "Career & Business Path",
  timing: "Timing, Transits & Forecast",
}

export const sectionSystems: Record<SectionType, string> = {
  life_purpose: lifePurposeSystem,
  finances: financesSystem,
  health: healthSystem,
  relationships: relationshipsSystem,
  business: businessSystem,
  timing: timingSystem,
}

export const sectionBuilders: Record<
  SectionType,
  (chartData: ChartData) => string
> = {
  life_purpose: buildLifePurposePrompt,
  finances: buildFinancesPrompt,
  health: buildHealthPrompt,
  relationships: buildRelationshipsPrompt,
  business: buildBusinessPrompt,
  timing: buildTimingPrompt,
}

export {
  lifePurposeSystem,
  buildLifePurposePrompt,
  financesSystem,
  buildFinancesPrompt,
  healthSystem,
  buildHealthPrompt,
  relationshipsSystem,
  buildRelationshipsPrompt,
  businessSystem,
  buildBusinessPrompt,
  timingSystem,
  buildTimingPrompt,
  synthesisSystem,
  buildSynthesisPrompt,
  type SectionInput,
}
