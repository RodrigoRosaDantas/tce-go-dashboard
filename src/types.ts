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
  sections?: Array<{ heading: string; body: string }>;
  version?: number;
  lastEdited?: string;
}

export interface QuestionSnapshot {
  qxx: string;
  dxx: string;
  title: string;
  meta: number;
  valid: number;
  sourceSummary: string;
  copyrightMode: "metadata-only" | "project-authored";
  version?: number;
  lastEdited?: string;
  gapDeclared?: boolean;
}

export interface Snapshot {
  schemaVersion: string;
  generatedAt: string;
  source: "notion";
  contentMode?: "bootstrap" | "full";
  contentHash?: string;
  days: DaySnapshot[];
  materials: Record<string, MaterialSnapshot>;
  questions: Record<string, QuestionSnapshot>;
  publicStats: {
    totalDays: number;
    activeDays: number;
    protectedDays: number;
    sessions: number;
    readyDays: number;
    materialDays?: number;
    questionDays?: number;
  };
}
