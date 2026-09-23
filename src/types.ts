export type EditorialStatus = "ready" | "audited" | "draft" | "protected";

export interface DaySnapshot {
  dxx: string;
  order: number;
  session?: string;
  protected: boolean;
  date: string;
  type: string;
  focus: string;
  editorialStatus: EditorialStatus;
  readyForStudy: boolean;
  slug?: string;
  version?: number;
  questionSlug?: string;
}

export interface MaterialSnapshot {
  dxx: string;
  title: string;
  summary: string;
  contentHtml?: string;
  sections?: Array<{ heading: string; body: string }>;
  version?: number;
  lastEdited?: string;
  hash?: string;
}

export interface PlatformBattery {
  materia: string;
  topico: string;
  subtopico?: string;
  size: number;
}

export interface AuthorialQuestionChoice {
  key: string;
  text: string;
}

export interface AuthorialQuestionItem {
  number: number;
  id: string;
  title: string;
  prompt: string;
  choices: AuthorialQuestionChoice[];
  answer?: string;
  rationale?: string;
}

export interface QuestionSnapshot {
  qxx: string;
  dxx: string;
  title: string;
  meta: number;
  valid: number;
  sourceSummary: string;
  copyrightMode: "metadata-only";
  contentHtml?: string;
  sections?: Array<{ heading: string; body: string }>;
  hash?: string;
  version?: number;
  lastEdited?: string;
  gapDeclared?: boolean;
  adaptive?: boolean;
  platformBattery?: PlatformBattery;
  authorialItems?: AuthorialQuestionItem[];
}

export interface RedactionPlanSnapshot {
  code: string;
  title: string;
  dxx: string;
  date: string;
  theme: string;
}

export interface SimulationPlanSnapshot {
  title: string;
  dxx: string;
  date: string;
  type: string;
  plannedCoverage: number;
  plannedSessions: number;
}

export interface EditalItemSnapshot {
  code: string;
  order: number;
  discipline: string;
  active: boolean;
  block: string;
  questions: number;
  weight: number;
  weightedPoints: number;
  editorialStatus: string;
  normativeSource: string;
}

export interface LegislationSourceSnapshot {
  code: string;
  title: string;
  category: string;
  cutoff: string;
  dxx: string;
  use: string;
  status: string;
  officialUrl: string;
}

export interface FinalSprintDaySnapshot {
  code: string;
  order: number;
  date: string;
  title: string;
  type: string;
}

export interface Snapshot {
  schemaVersion: string;
  generatedAt: string;
  source: "notion";
  contentMode?: "bootstrap" | "full";
  auxiliaryMode?: "full";
  contentHash?: string;
  days: DaySnapshot[];
  materials: Record<string, MaterialSnapshot>;
  questions: Record<string, QuestionSnapshot>;
  redactions?: RedactionPlanSnapshot[];
  simulations?: SimulationPlanSnapshot[];
  edital?: EditalItemSnapshot[];
  legislation?: LegislationSourceSnapshot[];
  finalSprint?: FinalSprintDaySnapshot[];
  publicStats: {
    totalDays: number;
    activeDays: number;
    protectedDays: number;
    sessions: number;
    readyDays: number;
    materialPages?: number;
    questionPages?: number;
    redactionPlans?: number;
    simulationPlans?: number;
    editalItems?: number;
    legislationSources?: number;
    finalSprintDays?: number;
  };
}
