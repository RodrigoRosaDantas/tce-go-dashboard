import type { Snapshot } from "../types";
import type { OperationalError, OperationalReview, OperationalSummary, ProgressState } from "../progress";
import { publishedDays } from "../v3/shared";

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
  kind: "critical-error" | "overdue-review" | "resume" | "redaction" | "simulation" | "next-session" | "upcoming-review" | "maintenance";
  eyebrow: string;
  title: string;
  reason: string;
  href: string;
  dxx?: string;
  badge?: string;
};

export function deriveDecision(snapshot: Snapshot, summary: OperationalSummary): DecisionAction {
  const today = todayBrasilia();
  const critical = criticalErrors(summary)[0];
  if (critical) {
    return {
      kind: "critical-error",
      eyebrow: critical.fatal ? "FATAL ERROR" : "ERRO P1",
      title: critical.topic || critical.error || "Erro crítico aberto",
      reason: `${critical.dxx || "Origem não informada"} · ${critical.recurrence ? `${critical.recurrence} reincidência(s) · ` : ""}corrigir antes de acumular nova matéria.`,
      href: `/erros/?dxx=${encodeURIComponent(critical.dxx || "")}`,
      dxx: critical.dxx || undefined,
      badge: critical.severity || "Fatal",
    };
  }

  const queues = reviewQueues(summary);
  const review = queues.overdue[0] ?? queues.today[0];
  if (review) {
    return {
      kind: "overdue-review",
      eyebrow: queues.overdue.includes(review) ? "REVISÃO ATRASADA" : "REVISÃO DE HOJE",
      title: `${review.type} · ${review.dxx}`,
      reason: `${review.reason || "Retenção programada"} · prevista para ${dateOnly(review.plannedDate) || "sem data"}.`,
      href: `/revisoes/?dxx=${review.dxx}&type=${encodeURIComponent(review.type)}&reason=${encodeURIComponent(review.reason || "Conteúdo novo")}`,
      dxx: review.dxx,
      badge: review.type,
    };
  }

  const published = publishedDays(snapshot);
  const byProgress = progressMap(summary);
  const resume = published.find((day) => sessionState(byProgress.get(day.dxx)) === "in-progress");
  if (resume) {
    return {
      kind: "resume",
      eyebrow: "RETOMAR SESSÃO",
      title: `${resume.session} · ${resume.focus}`,
      reason: "Há execução iniciada e ainda não concluída no estado canônico.",
      href: `/dia/${resume.dxx.toLowerCase()}/`,
      dxx: resume.dxx,
      badge: resume.session,
    };
  }

  const redactionPlans = snapshot.redactions ?? [];
  const redactionStatus = new Map(summary.redactions.map((item) => [item.dxx, item.status]));
  const pendingRedaction = redactionPlans.find((plan) => plan.date <= today && !["Produzida", "Corrigida", "Reescrita"].includes(redactionStatus.get(plan.dxx) || "Planejada"));
  if (pendingRedaction) {
    return {
      kind: "redaction",
      eyebrow: "REDAÇÃO PENDENTE",
      title: pendingRedaction.title,
      reason: `${pendingRedaction.dxx} · marco previsto em ${pendingRedaction.date} ainda sem execução confirmada.`,
      href: `/redacoes/?dxx=${pendingRedaction.dxx}`,
      dxx: pendingRedaction.dxx,
      badge: pendingRedaction.code,
    };
  }

  const simulations = snapshot.simulations ?? [];
  const simDone = new Set(summary.simulations.filter((item) => (item.generalTotal ?? 0) + (item.specificTotal ?? 0) > 0).map((item) => item.dxx));
  const pendingSimulation = simulations.find((plan) => plan.date <= today && !simDone.has(plan.dxx));
  if (pendingSimulation) {
    return {
      kind: "simulation",
      eyebrow: "CHECKPOINT PENDENTE",
      title: pendingSimulation.title,
      reason: `${pendingSimulation.dxx} · marco previsto em ${pendingSimulation.date} ainda sem resultado real.`,
      href: `/simulados/?dxx=${pendingSimulation.dxx}`,
      dxx: pendingSimulation.dxx,
      badge: pendingSimulation.type,
    };
  }

  const next = published.find((day) => sessionState(byProgress.get(day.dxx)) !== "completed");
  if (next) {
    return {
      kind: "next-session",
      eyebrow: "PRÓXIMA SESSÃO",
      title: `${next.session} · ${next.focus}`,
      reason: "Primeira sessão publicada ainda não concluída, respeitando a ordem pedagógica.",
      href: `/dia/${next.dxx.toLowerCase()}/`,
      dxx: next.dxx,
      badge: next.session,
    };
  }

  const upcoming = queues.upcoming[0];
  if (upcoming) {
    return {
      kind: "upcoming-review",
      eyebrow: "PRÓXIMA REVISÃO",
      title: `${upcoming.type} · ${upcoming.dxx}`,
      reason: `Trilha publicada concluída; próxima retenção prevista em ${dateOnly(upcoming.plannedDate)}.`,
      href: "/revisoes/",
      dxx: upcoming.dxx,
      badge: upcoming.type,
    };
  }

  return {
    kind: "maintenance",
    eyebrow: "MANUTENÇÃO",
    title: "Sem pendência prioritária confirmada.",
    reason: "Use Desempenho, Erros e Reta Final para manutenção seletiva.",
    href: "/desempenho/",
  };
}
