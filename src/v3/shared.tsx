import type { DaySnapshot, Snapshot } from "../types";
import { cachedProgress } from "../progress";

export function href(path: string) {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}

export function currentDateInBrasilia() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function hasPublicSession(snapshot: Snapshot, day: DaySnapshot) {
  if (day.protected || !day.readyForStudy || !day.slug || !day.questionSlug) return false;
  return Boolean(snapshot.materials[day.slug] && snapshot.questions[day.questionSlug]);
}

export function activeDays(snapshot: Snapshot) {
  return [...snapshot.days].filter((day) => !day.protected).sort((a, b) => a.order - b.order);
}

export function publishedDays(snapshot: Snapshot) {
  return activeDays(snapshot).filter((day) => hasPublicSession(snapshot, day));
}

export function nextStudyDay(snapshot: Snapshot) {
  const published = publishedDays(snapshot);
  return published.find((day) => !cachedProgress(day.dxx)?.completed);
}

export function extractStudyToc(html?: string) {
  if (!html || typeof DOMParser === "undefined") return [] as Array<{ id: string; label: string; level: number }>;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll("h2[id], h3[id]"))
    .slice(0, 28)
    .map((node) => ({
      id: node.id,
      label: node.textContent?.trim() || "Seção",
      level: node.tagName === "H3" ? 3 : 2,
    }));
}

export function completionStats(snapshot: Snapshot) {
  const active = activeDays(snapshot);
  const withProgress = active
    .map((day) => ({ day, progress: cachedProgress(day.dxx) }))
    .filter((item) => item.progress);

  const completed = withProgress.filter((item) => item.progress?.completed).length;
  const studied = withProgress.filter((item) => item.progress?.studied).length;
  const minutes = withProgress.reduce((sum, item) => sum + (item.progress?.timeMinutes ?? 0), 0);
  const questions = withProgress.reduce((sum, item) => sum + (item.progress?.questionsDone ?? 0), 0);
  const correct = withProgress.reduce((sum, item) => sum + (item.progress?.correct ?? 0), 0);
  const errors = withProgress.reduce((sum, item) => sum + (item.progress?.errors ?? 0), 0);
  const doubts = withProgress.reduce((sum, item) => sum + (item.progress?.doubts ?? 0), 0);
  const accuracy = correct + errors > 0 ? Math.round((correct / (correct + errors)) * 100) : null;

  return { active, withProgress, completed, studied, minutes, questions, correct, errors, doubts, accuracy };
}

export function DayLabel({ day }: { day: DaySnapshot }) {
  return (
    <span className="day-label">
      <strong>{day.dxx}</strong>
      {!day.protected && day.session ? <span className="session">· {day.session}</span> : null}
    </span>
  );
}
