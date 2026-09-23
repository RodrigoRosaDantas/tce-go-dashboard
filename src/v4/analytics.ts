import type { Snapshot } from "../types";
import type {
  OperationalDay,
  OperationalError,
  OperationalReview,
  OperationalSession,
  OperationalSummary,
} from "../progress";

export type DataIssue = {
  level: "error" | "warning" | "info";
  source: "Dxx" | "Sessões" | "Revisões" | "Erros" | "Redações" | "Checkpoints";
  key: string;
  message: string;
  fields?: string[];
};

export function hasExecution(day: OperationalDay) {
  return Boolean(
    day.studied || day.completed
    || day.status === "Em andamento" || day.status === "Concluído"
    || (day.timeMinutes ?? 0) > 0 || (day.questionsDone ?? 0) > 0
    || (day.correct ?? 0) > 0 || (day.errors ?? 0) > 0 || (day.doubts ?? 0) > 0
  );
}

export function nullableSum(values: Array<number | null | undefined>) {
  const real = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return real.length ? real.reduce((sum, value) => sum + value, 0) : null;
}

export function accuracy(correct?: number | null, errors?: number | null) {
  if (correct == null || errors == null || correct + errors <= 0) return null;
  return (correct / (correct + errors)) * 100;
}

export function pct(value: number | null | undefined, digits = 0) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)}%`;
}

export function parsePlannedMinutes(value?: string | null) {
  if (!value) return { min: null as number | null, max: null as number | null };
  const text = value.toLowerCase().replace(",", ".").trim();
  const range = text.match(/(\d+)\s*[–-]\s*(\d+)\s*min/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const hoursMinutes = text.match(/(?:(\d+)h)?\s*(\d+)?\s*min?/);
  if (/h/.test(text)) {
    const h = Number(text.match(/(\d+)h/)?.[1] || 0);
    const m = Number(text.match(/h\s*(\d{1,2})/)?.[1] || 0);
    const total = h * 60 + m;
    if (total > 0) return { min: text.includes("até") ? null : total, max: total };
  }
  if (hoursMinutes?.[2]) {
    const total = Number(hoursMinutes[2]);
    return { min: text.includes("até") ? null : total, max: total };
  }
  const minutes = text.match(/(\d+)\s*min/);
  if (minutes) {
    const total = Number(minutes[1]);
    return { min: text.includes("até") ? null : total, max: total };
  }
  return { min: null, max: null };
}

export function plannedTimeRange(days: OperationalDay[]) {
  let min = 0;
  let max = 0;
  let hasMin = false;
  let hasMax = false;
  for (const day of days) {
    if (day.protected) continue;
    const parsed = parsePlannedMinutes(day.plannedTime);
    if (parsed.min != null) { min += parsed.min; hasMin = true; }
    if (parsed.max != null) { max += parsed.max; hasMax = true; }
  }
  return { min: hasMin ? min : null, max: hasMax ? max : null };
}

export function sessionRowsByDay(summary: OperationalSummary) {
  const map = new Map<string, OperationalSession[]>();
  for (const row of summary.sessions) {
    const dxx = (row.dxx || "").toUpperCase();
    if (!dxx) continue;
    const list = map.get(dxx) ?? [];
    list.push(row);
    map.set(dxx, list);
  }
  for (const list of map.values()) {
    list.sort((a,b) => String(b.timestamp || b.date || "").localeCompare(String(a.timestamp || a.date || "")));
  }
  return map;
}

export function dataOrigin(day: OperationalDay, sessions: OperationalSession[]) {
  if (!hasExecution(day)) return "Sem execução";
  if (!sessions.length) return "Banco Dxx";
  if (sessions.some((row) => row.origin === "tce-go-dashboard")) return "Site → Notion";
  if (sessions.some((row) => row.origin === "plataforma-questoes")) return "Plataforma → Notion";
  return "Sessão no Notion";
}

export function buildDataIssues(summary: OperationalSummary, snapshot: Snapshot) {
  const issues: DataIssue[] = [];
  const active = new Set(snapshot.days.filter((day) => !day.protected).map((day) => day.dxx));
  const sessionMap = sessionRowsByDay(summary);

  for (const day of summary.dayControl.filter((item) => !item.protected && hasExecution(item))) {
    const missing: string[] = [];
    if (day.timeMinutes == null) missing.push("Tempo real");
    if (day.questionsDone == null) missing.push("Questões feitas");
    if ((day.questionsDone ?? 0) > 0 && day.correct == null) missing.push("Acertos");
    if ((day.questionsDone ?? 0) > 0 && day.errors == null) missing.push("Erros");
    if ((day.questionsDone ?? 0) > 0 && day.doubts == null) missing.push("Acertos com dúvida");
    if (missing.length) {
      issues.push({ level:"warning", source:"Dxx", key:day.dxx, fields:missing, message:`Execução iniciada/concluída com ${missing.length} campo(s) não preenchido(s).` });
    }
    if (day.questionsDone != null && day.correct != null && day.errors != null && day.correct + day.errors !== day.questionsDone) {
      issues.push({ level:"error", source:"Dxx", key:day.dxx, fields:["Questões feitas","Acertos","Erros"], message:`Acertos + erros (${day.correct + day.errors}) difere de questões feitas (${day.questionsDone}).` });
    }
    if (day.correct != null && day.doubts != null && day.doubts > day.correct) {
      issues.push({ level:"error", source:"Dxx", key:day.dxx, fields:["Acertos","Acertos com dúvida"], message:"Acertos com dúvida excedem acertos." });
    }
    if (day.completed && day.status !== "Concluído") {
      issues.push({ level:"warning", source:"Dxx", key:day.dxx, fields:["Concluído","Status"], message:`Checkbox Concluído está marcado, mas Status = ${day.status || "vazio"}.` });
    }
    if (!sessionMap.get(day.dxx)?.length) {
      issues.push({ level:"info", source:"Sessões", key:day.dxx, message:"Há execução no Banco Dxx sem linha detalhada em Sessões e Desempenho. O Dashboard usa o Dxx como total canônico." });
    }
  }

  for (const row of summary.sessions) {
    const dxx = (row.dxx || "").toUpperCase();
    if (dxx && !active.has(dxx)) issues.push({ level:"error", source:"Sessões", key:row.title, message:`Sessão aponta para ${dxx}, que não é Dxx ativo.` });
    if ((row.questions ?? 0) > 0 && (row.correct == null || row.errors == null)) {
      issues.push({ level:"warning", source:"Sessões", key:row.title, fields:["Acertos","Erros"], message:"Linha de sessão com questões mas sem correção completa." });
    }
  }

  for (const review of summary.reviews) {
    if (review.status === "Concluída") {
      const missing = [review.performedDate == null ? "Data realizada" : "", review.questions == null ? "Questões de revisão" : "", review.correct == null ? "Acertos" : "", review.errors == null ? "Erros" : ""].filter(Boolean);
      if (missing.length) issues.push({ level:"warning", source:"Revisões", key:`${review.type} · ${review.dxx}`, fields:missing, message:"Revisão concluída com resultado incompleto." });
    }
  }

  for (const essay of summary.redactions) {
    if (["Corrigida","Reescrita"].includes(essay.status) && essay.score == null) {
      issues.push({ level:"warning", source:"Redações", key:essay.title, fields:["Nota simulada /100"], message:"Redação corrigida sem nota registrada." });
    }
  }

  for (const sim of summary.simulations) {
    const executed = (sim.generalTotal ?? 0) + (sim.specificTotal ?? 0) > 0 || sim.ipi != null;
    if (executed && sim.timeMinutes == null) issues.push({ level:"warning", source:"Checkpoints", key:sim.title, fields:["Tempo (min)"], message:"Checkpoint/simulado com resultado, mas sem tempo registrado." });
  }

  return issues;
}

export function disciplineRows(summary: OperationalSummary, snapshot: Snapshot) {
  const dayMap = new Map(summary.dayControl.map((day) => [day.dxx, day]));
  const groups = new Map<string, {
    discipline:string; sessions:number; planned:number; done:number; correct:number; errors:number; doubts:number; minutes:number; execution:number;
  }>();

  for (const day of snapshot.days.filter((item) => !item.protected)) {
    const question = day.questionSlug ? snapshot.questions[day.questionSlug] : undefined;
    const discipline = question?.platformBattery?.materia || "Sem disciplina estruturada";
    const row = dayMap.get(day.dxx);
    const group = groups.get(discipline) ?? { discipline,sessions:0,planned:0,done:0,correct:0,errors:0,doubts:0,minutes:0,execution:0 };
    group.sessions += 1;
    group.planned += row?.metaQuestions ?? question?.valid ?? 0;
    if (row && hasExecution(row)) {
      group.execution += 1;
      group.done += row.questionsDone ?? 0;
      group.correct += row.correct ?? 0;
      group.errors += row.errors ?? 0;
      group.doubts += row.doubts ?? 0;
      group.minutes += row.timeMinutes ?? 0;
    }
    groups.set(discipline, group);
  }
  return [...groups.values()].sort((a,b) => b.planned-a.planned || a.discipline.localeCompare(b.discipline,"pt-BR"));
}

export function errorRows(errors: OperationalError[]) {
  const groups = new Map<string,{label:string;subject:string;topic:string;open:number;critical:number;recurrent:number;doubts:number}>();
  for (const item of errors) {
    const subject = item.subject || "Sem matéria";
    const topic = item.topic || "Sem tópico";
    const label = `${subject} · ${topic}`;
    const row = groups.get(label) ?? { label,subject,topic,open:0,critical:0,recurrent:0,doubts:0 };
    if (!["Validado","Encerrado"].includes(item.status)) row.open += 1;
    row.critical += Number(item.fatal || item.severity === "P1");
    row.recurrent += item.recurrence ?? 0;
    row.doubts += Number(item.doubt);
    groups.set(label,row);
  }
  return [...groups.values()].sort((a,b)=>b.critical-a.critical||b.recurrent-a.recurrent||b.open-a.open);
}

export function reviewStats(reviews: OperationalReview[]) {
  const result = { total:reviews.length, completed:0, pending:0, questions:0, correct:0, errors:0 };
  for (const review of reviews) {
    if (review.status === "Concluída") result.completed += 1;
    else if (review.status !== "Cancelada por domínio") result.pending += 1;
    result.questions += review.questions ?? 0;
    result.correct += review.correct ?? 0;
    result.errors += review.errors ?? 0;
  }
  return result;
}
