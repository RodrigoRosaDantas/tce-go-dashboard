import type { Snapshot } from "../types";
import type { OperationalError, OperationalReview, OperationalSummary, ProgressState } from "../progress";
import { buildStudyIntelligence } from "./intelligence-core.mjs";

export function todayBrasilia() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function isReviewDone(review: OperationalReview) {
  return ["Concluída", "Cancelada por domínio"].includes(review.status);
}

export function reviewBucket(review: OperationalReview, today = todayBrasilia()) {
  if (isReviewDone(review)) return "completed" as const;
  const date = dateOnly(review.plannedDate);
  if (!date) return "unscheduled" as const;
  if (date < today) return "overdue" as const;
  if (date === today) return "today" as const;
  return "upcoming" as const;
}

export function reviewQueues(summary: OperationalSummary) {
  const groups = {
    overdue: [] as OperationalReview[],
    today: [] as OperationalReview[],
    upcoming: [] as OperationalReview[],
    unscheduled: [] as OperationalReview[],
    completed: [] as OperationalReview[],
  };
  for (const review of summary.reviews) groups[reviewBucket(review)].push(review);
  for (const list of Object.values(groups)) {
    list.sort((a, b) => String(a.plannedDate || a.performedDate || "").localeCompare(String(b.plannedDate || b.performedDate || "")));
  }
  return groups;
}

export function isOpenError(error: OperationalError) {
  return !["Validado", "Encerrado"].includes(error.status);
}

export function criticalErrors(summary: OperationalSummary) {
  return summary.errors
    .filter((error) => isOpenError(error) && (error.fatal || error.severity === "P1"))
    .sort((a, b) => Number(b.fatal) - Number(a.fatal) || (b.recurrence ?? 0) - (a.recurrence ?? 0));
}

export function errorsForDay(summary: OperationalSummary, dxx: string) {
  return summary.errors.filter((error) => error.dxx === dxx && isOpenError(error));
}

export function reviewsForDay(summary: OperationalSummary, dxx: string) {
  return summary.reviews.filter((review) => review.dxx === dxx && !isReviewDone(review));
}

export function progressMap(summary: OperationalSummary) {
  return new Map(summary.progress.map((item) => [item.dxx, item]));
}

export function sessionState(progress?: ProgressState | null) {
  if (progress?.completed) return "completed" as const;
  if (progress?.studied || (progress?.timeMinutes ?? 0) > 0 || (progress?.questionsDone ?? 0) > 0) return "in-progress" as const;
  return "not-started" as const;
}

export type DecisionAction = {
  kind: "weakness" | "review" | "resume" | "redaction" | "simulation" | "next-session" | "upcoming-review" | "maintenance";
  eyebrow: string;
  title: string;
  reason: string;
  href: string;
  dxx?: string;
  badge?: string;
  score?: number;
  evidence?: string[];
  breakdown?: Record<string, unknown>;
  after?: { title: string; href: string; dxx?: string } | null;
};

export function deriveDecision(snapshot: Snapshot, summary: OperationalSummary): DecisionAction {
  const recommendation = buildStudyIntelligence({ snapshot, summary, referenceDate: todayBrasilia() }).recommendation;
  return {
    kind: recommendation.kind,
    eyebrow: recommendation.eyebrow,
    title: recommendation.title,
    reason: recommendation.reason,
    href: recommendation.href,
    dxx: recommendation.dxx,
    badge: recommendation.badge,
    score: recommendation.score,
    evidence: recommendation.evidence,
    breakdown: recommendation.breakdown,
    after: recommendation.after,
  };
}
