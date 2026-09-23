import { FormEvent, useMemo, useState } from "react";
import type { Snapshot } from "./types";
import {
  createProgressEvent,
  hasConnectedAccount,
  loadProgress,
  platformAccountUrl,
  queueAndSync,
  type ProgressEvent,
} from "./progress";

type EventType = ProgressEvent["eventType"];

function numberOrUndefined(value: string) {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resultMessage(result: Awaited<ReturnType<typeof queueAndSync>>) {
  if (result.status === "confirmed") return "Confirmado no Notion.";
  if (result.status === "conflict") return result.data?.error || "Conflito com o estado canônico.";
  if (result.reason === "offline") return "Sem conexão: evento preservado na fila local.";
  if (result.reason === "auth") return "Conta de progresso não conectada.";
  return result.data?.message || result.data?.error || "Pendente de sincronização.";
}

async function submitSpecialized(
  snapshot: Snapshot,
  dxx: string,
  eventType: EventType,
  payload: ProgressEvent["payload"],
) {
  if (!hasConnectedAccount()) {
    return { status: "not-connected" as const, message: "Conecte a conta privada de progresso antes de registrar execução." };
  }
  const day = snapshot.days.find((item) => item.dxx === dxx);
  if (!day || day.protected || !day.session) {
    return { status: "invalid-day" as const, message: "Dxx ativo não localizado." };
  }
  const canonical = await loadProgress(dxx);
  const event = createProgressEvent({
    dxx,
    sxx: day.session,
    eventType,
    baseCanonicalRevision: canonical?.canonicalRevision ?? null,
    payload,
  });
  const result = await queueAndSync(event);
  return { status: result.status, message: resultMessage(result) };
}

function PrivateWritebackIntro() {
  const connected = hasConnectedAccount();
  return (
    <div className="notice private-writeback-intro">
      <strong>Registro privado.</strong> Estes formulários não entram no snapshot público. A gravação segue
      site → endpoint autenticado → Notion. {connected ? "Conta conectada." : "Conta ainda não conectada."}
      {!connected ? <a className="secondary" href={platformAccountUrl()}>Conectar pela Plataforma de Questões</a> : null}
    </div>
  );
}

export function ReviewWriteback({ snapshot }: { snapshot: Snapshot }) {
  const active = useMemo(() => snapshot.days.filter((d) => !d.protected && d.session), [snapshot]);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestedDxx = params.get("dxx");
  const [dxx, setDxx] = useState(() => active.some((d) => d.dxx === requestedDxx) ? String(requestedDxx) : active[0]?.dxx ?? "D001");
  const [reviewType, setReviewType] = useState(() => params.get("type") || "D0");
  const [reason, setReason] = useState(() => params.get("reason") || "Conteúdo novo");
  const [status, setStatus] = useState(() => {
    const requested = params.get("status");
    return ["Pendente","Próxima","Concluída","Cancelada por domínio"].includes(String(requested)) ? String(requested) : "Concluída";
  });
  const [plannedDate, setPlannedDate] = useState("");
  const [questions, setQuestions] = useState("");
  const [correct, setCorrect] = useState("");
  const [errors, setErrors] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await submitSpecialized(snapshot, dxx, "review.snapshot", {
      reviewType,
      reason,
      status,
      plannedDate: plannedDate || undefined,
      questions: numberOrUndefined(questions) ?? 0,
      correct: numberOrUndefined(correct) ?? 0,
      errors: numberOrUndefined(errors) ?? 0,
      timeMinutes: numberOrUndefined(time) ?? 0,
      performedDate: status === "Concluída" ? new Date().toISOString() : undefined,
      notes,
    });
    setMessage(result.message);
    setBusy(false);
  }

  return (
    <article className="panel execution-module">
      <h2>Programar ou registrar revisão</h2>
      <PrivateWritebackIntro />
      <form className="progress-form" onSubmit={save}>
        <div className="progress-fields">
          <label>Dxx origem<select value={dxx} onChange={(e) => setDxx(e.target.value)}>{active.map((d) => <option key={d.dxx} value={d.dxx}>{d.dxx} · {d.session}</option>)}</select></label>
          <label>Tipo<select value={reviewType} onChange={(e) => setReviewType(e.target.value)}><option>D0</option><option>D7</option><option>D20</option><option>Fatal Error</option></select></label>
          <label>Motivo<select value={reason} onChange={(e) => setReason(e.target.value)}><option>Conteúdo novo</option><option>Erro relevante</option><option>Legislação</option><option>Reincidência</option><option>Calibração</option></select></label>
          <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option>Pendente</option><option>Próxima</option><option>Concluída</option><option>Cancelada por domínio</option></select></label>
          <label>Data prevista<input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} /></label>
          <label>Questões<input type="number" min="0" value={questions} onChange={(e) => setQuestions(e.target.value)} /></label>
          <label>Acertos<input type="number" min="0" value={correct} onChange={(e) => setCorrect(e.target.value)} /></label>
          <label>Erros<input type="number" min="0" value={errors} onChange={(e) => setErrors(e.target.value)} /></label>
          <label>Tempo (min)<input type="number" min="0" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        </div>
        <label className="notes-field">Observações<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <div className="progress-actions"><button className="primary button" type="submit" disabled={busy}>{busy ? "Sincronizando…" : "Salvar revisão"}</button><span className="small">{message}</span></div>
      </form>
    </article>
  );
}

export function EssayWriteback({ snapshot }: { snapshot: Snapshot }) {
  const plans = snapshot.redactions ?? [];
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestedDxx = params.get("dxx");
  const [dxx, setDxx] = useState(() => plans.some((p) => p.dxx === requestedDxx) ? String(requestedDxx) : plans[0]?.dxx ?? "D019");
  const [status, setStatus] = useState("Produzida");
  const [lines, setLines] = useState("");
  const [time, setTime] = useState("");
  const [scores, setScores] = useState({ recorte: "", interpretacao: "", progressao: "", vocabulario: "", coesao: "", morfossintaxe: "" });
  const [mainError, setMainError] = useState("");
  const [rewriteNeeded, setRewriteNeeded] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function scoreField(key: keyof typeof scores, label: string, max: number) {
    return <label>{label}<input type="number" min="0" max={max} step="0.5" value={scores[key]} onChange={(e) => setScores((v) => ({ ...v, [key]: e.target.value }))} /></label>;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (status !== "Em produção" && (!lines.trim() || !time.trim())) {
      setMessage("Redação produzida/corrigida exige linhas e tempo real.");
      return;
    }
    setBusy(true);
    const result = await submitSpecialized(snapshot, dxx, "essay.result", {
      status,
      lines: numberOrUndefined(lines),
      timeMinutes: numberOrUndefined(time),
      recorte: numberOrUndefined(scores.recorte),
      interpretacao: numberOrUndefined(scores.interpretacao),
      progressao: numberOrUndefined(scores.progressao),
      vocabulario: numberOrUndefined(scores.vocabulario),
      coesao: numberOrUndefined(scores.coesao),
      morfossintaxe: numberOrUndefined(scores.morfossintaxe),
      mainError,
      rewriteNeeded,
    });
    setMessage(result.message);
    setBusy(false);
  }

  return (
    <article className="panel execution-module">
      <h2>Registrar execução/correção da redação</h2>
      <PrivateWritebackIntro />
      <form className="progress-form" onSubmit={save}>
        <div className="progress-fields">
          <label>Redação<select value={dxx} onChange={(e) => setDxx(e.target.value)}>{plans.map((p) => <option key={p.code} value={p.dxx}>{p.code} · {p.dxx}</option>)}</select></label>
          <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option>Em produção</option><option>Produzida</option><option>Corrigida</option><option>Reescrita</option></select></label>
          <label>Linhas<input type="number" min="1" required={status !== "Em produção"} value={lines} onChange={(e) => setLines(e.target.value)} /></label>
          <label>Tempo (min)<input type="number" min="1" required={status !== "Em produção"} value={time} onChange={(e) => setTime(e.target.value)} /></label>
          {scoreField("recorte", "Recorte /20", 20)}
          {scoreField("interpretacao", "Interpretação /20", 20)}
          {scoreField("progressao", "Progressão /30", 30)}
          {scoreField("vocabulario", "Vocabulário /8", 8)}
          {scoreField("coesao", "Coesão /16", 16)}
          {scoreField("morfossintaxe", "Morfossintaxe /6", 6)}
        </div>
        <label className="notes-field">Erro principal<textarea value={mainError} onChange={(e) => setMainError(e.target.value)} /></label>
        <label className="check-field"><input type="checkbox" checked={rewriteNeeded} onChange={(e) => setRewriteNeeded(e.target.checked)} /> Reescrita necessária</label>
        <div className="progress-actions"><button className="primary button" type="submit" disabled={busy}>{busy ? "Sincronizando…" : "Salvar redação"}</button><span className="small">{message}</span></div>
      </form>
    </article>
  );
}

export function SimulationWriteback({ snapshot }: { snapshot: Snapshot }) {
  const plans = snapshot.simulations ?? [];
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestedDxx = params.get("dxx");
  const [dxx, setDxx] = useState(() => plans.some((p) => p.dxx === requestedDxx) ? String(requestedDxx) : plans[0]?.dxx ?? "D020");
  const [generalTotal, setGeneralTotal] = useState("");
  const [generalCorrect, setGeneralCorrect] = useState("");
  const [specificTotal, setSpecificTotal] = useState("");
  const [specificCorrect, setSpecificCorrect] = useState("");
  const [coverageExecuted, setCoverageExecuted] = useState("");
  const [sessionsCompleted, setSessionsCompleted] = useState("");
  const [time, setTime] = useState("");
  const [timeByBlock, setTimeByBlock] = useState("");
  const [control, setControl] = useState("");
  const [casp, setCasp] = useState("");
  const [legislation, setLegislation] = useState("");
  const [known, setKnown] = useState("");
  const [weakKnown, setWeakKnown] = useState("");
  const [p1Open, setP1Open] = useState("");
  const [openErrors, setOpenErrors] = useState("");
  const [recurrent, setRecurrent] = useState("");
  const [essayScore, setEssayScore] = useState("");
  const [biggestEssayLoss, setBiggestEssayLoss] = useState("");
  const [impactedSeedf, setImpactedSeedf] = useState(false);
  const [impactedTjdft, setImpactedTjdft] = useState(false);
  const [decision, setDecision] = useState("Manter");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await submitSpecialized(snapshot, dxx, "simulation.result", {
      generalTotal: numberOrUndefined(generalTotal),
      generalCorrect: numberOrUndefined(generalCorrect),
      specificTotal: numberOrUndefined(specificTotal),
      specificCorrect: numberOrUndefined(specificCorrect),
      coverageExecuted: numberOrUndefined(coverageExecuted),
      sessionsCompleted: numberOrUndefined(sessionsCompleted),
      timeMinutes: numberOrUndefined(time),
      timeByBlock,
      controlPercent: numberOrUndefined(control),
      caspPercent: numberOrUndefined(casp),
      legislationPercent: numberOrUndefined(legislation),
      knownPercent: numberOrUndefined(known),
      weakKnown,
      p1Open: numberOrUndefined(p1Open),
      openErrors: numberOrUndefined(openErrors),
      recurrent: numberOrUndefined(recurrent),
      essayScore: numberOrUndefined(essayScore),
      biggestEssayLoss,
      impactedSeedf,
      impactedTjdft,
      decision,
      notes,
    });
    setMessage(result.message);
    setBusy(false);
  }

  return (
    <article className="panel execution-module">
      <h2>Registrar resultado do marco</h2>
      <PrivateWritebackIntro />
      <p className="small">O formulário segue o painel mínimo canônico: cobertura, objetiva, IPI, núcleos, matérias conhecidas, tempo, erros, carga, impacto externo e decisão.</p>
      <form className="progress-form" onSubmit={save}>
        <div className="progress-fields">
          <label>Marco<select value={dxx} onChange={(e) => setDxx(e.target.value)}>{plans.map((p) => <option key={p.dxx} value={p.dxx}>{p.dxx} · {p.type}</option>)}</select></label>
          <label>Cobertura executada<input required type="number" min="0" value={coverageExecuted} onChange={(e) => setCoverageExecuted(e.target.value)} /></label>
          <label>Sessões realizadas<input required type="number" min="0" value={sessionsCompleted} onChange={(e) => setSessionsCompleted(e.target.value)} /></label>
          <label>Gerais — total<input required type="number" min="0" value={generalTotal} onChange={(e) => setGeneralTotal(e.target.value)} /></label>
          <label>Gerais — acertos<input required type="number" min="0" value={generalCorrect} onChange={(e) => setGeneralCorrect(e.target.value)} /></label>
          <label>Específicos — total<input required type="number" min="0" value={specificTotal} onChange={(e) => setSpecificTotal(e.target.value)} /></label>
          <label>Específicos — acertos<input required type="number" min="0" value={specificCorrect} onChange={(e) => setSpecificCorrect(e.target.value)} /></label>
          <label>Tempo total (min)<input required type="number" min="1" value={time} onChange={(e) => setTime(e.target.value)} /></label>
          <label>Controle Externo %<input required type="number" min="0" max="100" step="0.1" value={control} onChange={(e) => setControl(e.target.value)} /></label>
          <label>CASP %<input required type="number" min="0" max="100" step="0.1" value={casp} onChange={(e) => setCasp(e.target.value)} /></label>
          <label>Legislação %<input required type="number" min="0" max="100" step="0.1" value={legislation} onChange={(e) => setLegislation(e.target.value)} /></label>
          <label>Matérias conhecidas %<input required type="number" min="0" max="100" step="0.1" value={known} onChange={(e) => setKnown(e.target.value)} /></label>
          <label>P1 abertos<input required type="number" min="0" value={p1Open} onChange={(e) => setP1Open(e.target.value)} /></label>
          <label>Erros abertos<input required type="number" min="0" value={openErrors} onChange={(e) => setOpenErrors(e.target.value)} /></label>
          <label>Reincidentes<input required type="number" min="0" value={recurrent} onChange={(e) => setRecurrent(e.target.value)} /></label>
          <label>Redação /100 (se houver)<input type="number" min="0" max="100" step="0.5" value={essayScore} onChange={(e) => setEssayScore(e.target.value)} /></label>
          <label>Decisão<select value={decision} onChange={(e) => setDecision(e.target.value)}><option>Manter</option><option>Ajustar</option><option>Reduzir</option><option>Ampliar</option></select></label>
        </div>
        <label className="notes-field">Tempo por bloco<textarea required value={timeByBlock} onChange={(e) => setTimeByBlock(e.target.value)} /></label>
        <label className="notes-field">Pontos fracos — matérias conhecidas<textarea required value={weakKnown} onChange={(e) => setWeakKnown(e.target.value)} /></label>
        <label className="notes-field">Maior perda — redação (se houver)<textarea value={biggestEssayLoss} onChange={(e) => setBiggestEssayLoss(e.target.value)} /></label>
        <label className="notes-field">Observações<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <label className="check-field"><input type="checkbox" checked={impactedSeedf} onChange={(e) => setImpactedSeedf(e.target.checked)} /> Houve impacto perceptível na SEEDF</label>
        <label className="check-field"><input type="checkbox" checked={impactedTjdft} onChange={(e) => setImpactedTjdft(e.target.checked)} /> Houve impacto perceptível no TJDFT</label>
        <div className="progress-actions"><button className="primary button" type="submit" disabled={busy}>{busy ? "Sincronizando…" : "Salvar marco"}</button><span className="small">{message}</span></div>
      </form>
    </article>
  );
}

export function ErrorWriteback({ snapshot }: { snapshot: Snapshot }) {
  const active = useMemo(() => snapshot.days.filter((d) => !d.protected && d.session), [snapshot]);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestedDxx = params.get("dxx");
  const [dxx, setDxx] = useState(() => active.some((d) => d.dxx === requestedDxx) ? String(requestedDxx) : active[0]?.dxx ?? "D001");
  const [errorText, setErrorText] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [source, setSource] = useState("FCC");
  const [reason, setReason] = useState("Desconhecimento");
  const [severity, setSeverity] = useState("P2");
  const [marked, setMarked] = useState("");
  const [answerKey, setAnswerKey] = useState("");
  const [correctRule, setCorrectRule] = useState("");
  const [action, setAction] = useState("");
  const [fatal, setFatal] = useState(false);
  const [doubt, setDoubt] = useState(false);
  const [recurrence, setRecurrence] = useState("");
  const [nextCheck, setNextCheck] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!errorText.trim()) { setMessage("Descreva o erro antes de salvar."); return; }
    setBusy(true);
    const result = await submitSpecialized(snapshot, dxx, "error.capture", {
      error: errorText,
      questionId,
      subject,
      topic,
      source,
      reason,
      severity,
      markedAnswer: marked,
      answerKey,
      correctRule,
      action,
      fatal,
      doubt,
      recurrence: numberOrUndefined(recurrence) ?? 0,
      nextCheck,
      notes,
      status: "Aberto",
    });
    setMessage(result.message);
    setBusy(false);
  }

  return (
    <article className="panel execution-module">
      <h2>Capturar erro real</h2>
      <PrivateWritebackIntro />
      <form className="progress-form" onSubmit={save}>
        <div className="progress-fields">
          <label>Dxx<select value={dxx} onChange={(e) => setDxx(e.target.value)}>{active.map((d) => <option key={d.dxx} value={d.dxx}>{d.dxx} · {d.session}</option>)}</select></label>
          <label>ID questão<input value={questionId} onChange={(e) => setQuestionId(e.target.value)} /></label>
          <label>Matéria<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label>Tópico<input value={topic} onChange={(e) => setTopic(e.target.value)} /></label>
          <label>Fonte<select value={source} onChange={(e) => setSource(e.target.value)}><option>FCC</option><option>Autoral</option><option>Outra</option></select></label>
          <label>Motivo<select value={reason} onChange={(e) => setReason(e.target.value)}><option>Desconhecimento</option><option>Confusão conceitual</option><option>Lei/norma</option><option>Memória</option><option>Interpretação</option><option>Cálculo</option><option>Distração</option><option>Gestão do tempo</option></select></label>
          <label>Severidade<select value={severity} onChange={(e) => setSeverity(e.target.value)}><option>P1</option><option>P2</option><option>P3</option></select></label>
          <label>Resposta marcada<input value={marked} onChange={(e) => setMarked(e.target.value)} /></label>
          <label>Gabarito<input value={answerKey} onChange={(e) => setAnswerKey(e.target.value)} /></label>
          <label>Reincidência<input type="number" min="0" value={recurrence} onChange={(e) => setRecurrence(e.target.value)} /></label>
          <label>Próxima checagem<input placeholder="D7, D20 ou data" value={nextCheck} onChange={(e) => setNextCheck(e.target.value)} /></label>
        </div>
        <label className="notes-field">Erro<textarea required value={errorText} onChange={(e) => setErrorText(e.target.value)} /></label>
        <label className="notes-field">Regra correta<textarea value={correctRule} onChange={(e) => setCorrectRule(e.target.value)} /></label>
        <label className="notes-field">Ação<textarea value={action} onChange={(e) => setAction(e.target.value)} /></label>
        <label className="notes-field">Observação<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <label className="check-field"><input type="checkbox" checked={fatal} onChange={(e) => setFatal(e.target.checked)} /> Fatal Error</label>
        <label className="check-field"><input type="checkbox" checked={doubt} onChange={(e) => setDoubt(e.target.checked)} /> Acerto com dúvida</label>
        <div className="progress-actions"><button className="primary button" type="submit" disabled={busy}>{busy ? "Sincronizando…" : "Salvar erro"}</button><span className="small">{message}</span></div>
      </form>
    </article>
  );
}
