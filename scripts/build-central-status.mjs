import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TIME_ZONE = "America/Sao_Paulo";

export function localDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function buildCentralStatus(snapshot, { today = localDate(), publishedAt = today } = {}) {
  if (!snapshot || !Array.isArray(snapshot.days)) throw new Error("Snapshot TCE-GO sem calendário público.");
  if (typeof snapshot.generatedAt !== "string" || !snapshot.generatedAt) throw new Error("Snapshot TCE-GO sem generatedAt de origem.");
  if (!validDate(today) || !validDate(publishedAt)) throw new Error("Data local/publicação inválida.");

  const days = snapshot.days
    .filter(day => day && typeof day.dxx === "string" && validDate(day.date))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || (a.order ?? 999) - (b.order ?? 999));
  const next = days.find(day => day.readyForStudy === true && day.date >= today) || null;
  const sessions = Number.isInteger(snapshot.publicStats?.sessions) ? snapshot.publicStats.sessions : null;
  const first = days[0]?.dxx || null;
  const last = [...days].sort((a, b) => (b.order ?? 0) - (a.order ?? 0))[0]?.dxx || null;
  const cycle = first && last
    ? `${first}–${last}${sessions === null ? "" : ` · ${sessions} sessões públicas`}`
    : null;
  const notes = [
    "O contrato expõe somente o calendário público; não confirma estudo, progresso, desempenho ou revisões."
  ];
  if (!next) notes.push("Não há próxima unidade pública pronta com data igual ou posterior à data local.");
  const nextAction = next ? `${next.dxx} — ${next.focus}` : null;

  return {
    schemaVersion: 1,
    projectId: "tcego",
    publishedAt,
    source: {
      kind: "public-project-state",
      ref: "data/tce-go-snapshot.json#days",
      status: "published",
      updatedAt: snapshot.generatedAt
    },
    state: {
      phase: "Edital publicado",
      cycle,
      currentUnit: null,
      nextAction,
      nextActionKind: nextAction ? "planned" : "none",
      alerts: ["A próxima ação vem do calendário público; o contrato não publica progresso privado."]
    },
    study: {
      evidence: "planned",
      sourceRef: "data/tce-go-snapshot.json#days",
      updatedAt: snapshot.generatedAt,
      trail: "Calendário público TCE-GO",
      lastCompletedUnit: null,
      nextUnit: next?.dxx || null,
      lastStudiedAt: null,
      questionsDone: null,
      correct: null,
      errors: null,
      doubts: null,
      accuracy: null,
      reviewsDue: null,
      nextReviewAt: null,
      activeErrors: null,
      completedSessions: null,
      totalSessions: null,
      notes
    }
  };
}

async function main() {
  const snapshot = JSON.parse(await readFile(path.join(ROOT, "public/data/tce-go-snapshot.json"), "utf8"));
  const contract = buildCentralStatus(snapshot);
  await writeFile(path.join(ROOT, "public/central-status.json"), `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  console.log(`TCE-GO central-status: ${contract.state.nextAction || "sem ação futura"}; evidência planned; progresso privado indisponível.`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
