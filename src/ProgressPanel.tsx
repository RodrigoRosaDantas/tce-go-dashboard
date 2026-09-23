import { FormEvent, useEffect, useMemo, useState } from "react";
import type { DaySnapshot } from "./types";
import {
  cachedProgress,
  conflictCount,
  createProgressEvent,
  flushPending,
  hasConnectedAccount,
  loadProgress,
  pendingCount,
  platformAccountUrl,
  queueAndSync,
  queuedEvents,
  type ProgressState,
} from "./progress";

type FormState = {
  studied: boolean;
  completed: boolean;
  timeMinutes: number;
  questionsDone: number;
  correct: number;
  errors: number;
  doubts: number;
  notes: string;
};

const emptyForm: FormState = {
  studied: false,
  completed: false,
  timeMinutes: 0,
  questionsDone: 0,
  correct: 0,
  errors: 0,
  doubts: 0,
  notes: "",
};

type LocalQuestionResult = {
  dxx: string;
  qxx?: string;
  questionsDone: number;
  correct: number;
  errors: number;
  doubts: number;
  savedAt?: string;
};

function localQuestionResult(dxx: string): LocalQuestionResult | null {
  try {
    const raw = localStorage.getItem(`tce-go.v4.question-result.${dxx}`);
    return raw ? JSON.parse(raw) as LocalQuestionResult : null;
  } catch {
    return null;
  }
}

function applyQuestionResult(base: FormState, result: LocalQuestionResult | null) {
  if (!result) return base;
  return {
    ...base,
    studied: true,
    questionsDone: Math.max(base.questionsDone, Math.max(0, Math.round(result.questionsDone || 0))),
    correct: Math.max(base.correct, Math.max(0, Math.round(result.correct || 0))),
    errors: Math.max(base.errors, Math.max(0, Math.round(result.errors || 0))),
    doubts: Math.max(base.doubts, Math.max(0, Math.round(result.doubts || 0))),
  };
}

function fromProgress(state: ProgressState | null): FormState {
  if (!state) return emptyForm;
  return {
    studied: state.studied,
    completed: state.completed,
    timeMinutes: state.timeMinutes,
    questionsDone: state.questionsDone,
    correct: state.correct,
    errors: state.errors,
    doubts: state.doubts,
    notes: "",
  };
}

export function ProgressPanel({ day }: { day: DaySnapshot }) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [confirmed, setConfirmed] = useState<ProgressState | null>(() => cachedProgress(day.dxx));
  const [message, setMessage] = useState("Carregando progresso confirmado…");
  const [busy, setBusy] = useState(false);
  const [queueVersion, setQueueVersion] = useState(0);
  const connected = hasConnectedAccount();
  const pending = useMemo(() => pendingCount(day.dxx), [day.dxx, queueVersion]);
  const conflicts = useMemo(() => conflictCount(day.dxx), [day.dxx, queueVersion]);

  useEffect(() => {
    const onStudyTime = (event: Event) => {
      const detail = (event as CustomEvent<{ dxx?: string; minutes?: number }>).detail;
      if (detail?.dxx !== day.dxx || !Number.isFinite(detail?.minutes)) return;
      const minutes = Math.max(0, Math.round(Number(detail.minutes)));
      setForm((current) => ({
        ...current,
        studied: current.studied || minutes > 0,
        timeMinutes: Math.max(current.timeMinutes, minutes),
      }));
      setMessage(`Tempo do cronômetro aplicado ao fechamento: ${minutes} min. Revise antes de salvar.`);
    };
    window.addEventListener("tce-study-time", onStudyTime);
    return () => window.removeEventListener("tce-study-time", onStudyTime);
  }, [day.dxx]);

  useEffect(() => {
    const onQuestionResult = (event: Event) => {
      const detail = (event as CustomEvent<LocalQuestionResult>).detail;
      if (detail?.dxx !== day.dxx) return;
      setForm((current) => applyQuestionResult(current, detail));
      setMessage(`Resultado de ${detail.qxx || "Qxx"} aplicado ao fechamento. Revise antes de salvar.`);
    };
    window.addEventListener("tce-question-result", onQuestionResult);
    return () => window.removeEventListener("tce-question-result", onQuestionResult);
  }, [day.dxx]);

  useEffect(() => {
    let alive = true;
    loadProgress(day.dxx).then((state) => {
      if (!alive) return;
      if (state) {
        setConfirmed(state);
        const localResult = localQuestionResult(day.dxx);
        const resultIsNewer = localResult?.savedAt && (!state.eventOccurredAt || Date.parse(localResult.savedAt) > Date.parse(state.eventOccurredAt));
        setForm(applyQuestionResult(fromProgress(state), resultIsNewer ? localResult : null));
        setMessage(resultIsNewer
          ? `Estado canônico carregado + resultado local de ${localResult?.qxx || "Qxx"} ainda não salvo.`
          : state.canonical
            ? "Estado confirmado pelo Notion."
            : "Último estado confirmado em cache; a versão atual do Notion ainda não foi revalidada.");
      } else {
        const localResult = localQuestionResult(day.dxx);
        if (localResult) {
          setForm(applyQuestionResult(emptyForm, localResult));
          setMessage(`Resultado local de ${localResult.qxx || "Qxx"} importado; ainda não confirmado no Notion.`);
        } else {
          setMessage(connected ? "Sem progresso confirmado para este Dxx." : "Conta de progresso não conectada.");
        }
      }
    });

    const onQueue = () => setQueueVersion((value) => value + 1);
    const onOnline = async () => {
      await flushPending();
      onQueue();
      const state = await loadProgress(day.dxx);
      if (alive && state) {
        setConfirmed(state);
        setForm(fromProgress(state));
        setMessage(state.canonical
          ? "Sincronização confirmada pelo Notion."
          : "Conectado novamente; a versão atual do Notion ainda não foi revalidada.");
      }
    };
    window.addEventListener("tce-progress-queue", onQueue);
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => {
      if (navigator.onLine && pendingCount() > 0) void onOnline();
    }, 60_000);

    return () => {
      alive = false;
      window.removeEventListener("tce-progress-queue", onQueue);
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [day.dxx, connected]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.correct + form.errors > form.questionsDone) {
      setMessage("Acertos + erros não podem superar as questões feitas.");
      return;
    }
    if (form.doubts > form.correct) {
      setMessage("Acertos com dúvida não podem superar o total de acertos.");
      return;
    }

    setBusy(true);
    const type = form.completed && !confirmed?.completed
      ? "day.completed"
      : !form.completed && confirmed?.completed
        ? "day.reopened"
        : "progress.snapshot";

    const progressEvent = createProgressEvent({
      dxx: day.dxx,
      sxx: day.session ?? null,
      eventType: type,
      baseCanonicalRevision: confirmed?.canonicalRevision ?? null,
      payload: {
        studied: form.studied || form.completed || form.timeMinutes > 0 || form.questionsDone > 0,
        completed: form.completed,
        timeMinutes: form.timeMinutes,
        questionsDone: form.questionsDone,
        correct: form.correct,
        errors: form.errors,
        doubts: form.doubts,
        notes: form.notes.trim() || undefined,
        sourceUrl: window.location.href,
      },
    });

    const result = await queueAndSync(progressEvent);
    setQueueVersion((value) => value + 1);
    if (result.status === "confirmed") {
      const state = await loadProgress(day.dxx);
      if (state) {
        setConfirmed(state);
        setForm(fromProgress(state));
      }
      setMessage("Confirmado no Notion. O cache local foi atualizado depois da confirmação.");
      window.dispatchEvent(new CustomEvent("tce-progress-confirmed", { detail: { dxx: day.dxx } }));
    } else if (result.status === "conflict") {
      setMessage("Conflito preservado para auditoria. O Notion continua prevalecendo.");
    } else if (!navigator.onLine) {
      setMessage("Pendente de sincronização. O evento foi preservado neste dispositivo.");
    } else if (!connected) {
      setMessage("Pendente de sincronização. Conecte a mesma conta usada na Plataforma de Questões.");
    } else {
      setMessage("Pendente de sincronização. O evento não foi tratado como canônico.");
    }
    setBusy(false);
  }

  function setNumber(name: keyof Pick<FormState, "timeMinutes" | "questionsDone" | "correct" | "errors" | "doubts">, value: string) {
    const numeric = Math.max(0, Math.round(Number(value) || 0));
    setForm((current) => ({ ...current, [name]: numeric }));
  }

  return (
    <article className="panel progress-panel" aria-live="polite">
      <div className="progress-head">
        <div>
          <p className="eyebrow">Execução privada</p>
          <h2>Registrar progresso</h2>
          <p className="small">{day.dxx}{day.session ? " · " + day.session : ""}. Dxx é a identidade; Sxx é conferido novamente no Notion.</p>
        </div>
        <div className="sync-badges">
          {confirmed?.canonical ? <span className="badge ready">Notion confirmado</span> : <span className="badge muted">Sem confirmação canônica</span>}
          {pending ? <span className="badge pending">{pending} pendente{pending > 1 ? "s" : ""}</span> : null}
          {conflicts ? <span className="badge conflict">{conflicts} conflito{conflicts > 1 ? "s" : ""}</span> : null}
        </div>
      </div>

      {!connected ? (
        <div className="notice progress-notice">
          O site preserva o evento localmente, mas o writeback exige a conta já usada na Plataforma de Questões.
          <br />
          <a href={platformAccountUrl()}>Conectar conta na Plataforma de Questões</a>
        </div>
      ) : null}

      <form className="progress-form" onSubmit={submit}>
        <label className="check-field">
          <input type="checkbox" checked={form.studied} onChange={(e) => setForm((v) => ({ ...v, studied: e.target.checked }))} />
          Estudado
        </label>
        <label className="check-field">
          <input type="checkbox" checked={form.completed} onChange={(e) => setForm((v) => ({ ...v, completed: e.target.checked, studied: e.target.checked || v.studied }))} />
          Concluído
        </label>

        <div className="progress-fields">
          <label>Tempo real (min)<input inputMode="numeric" type="number" min="0" value={form.timeMinutes} onChange={(e) => setNumber("timeMinutes", e.target.value)} /></label>
          <label>Questões feitas<input inputMode="numeric" type="number" min="0" value={form.questionsDone} onChange={(e) => setNumber("questionsDone", e.target.value)} /></label>
          <label>Acertos<input inputMode="numeric" type="number" min="0" value={form.correct} onChange={(e) => setNumber("correct", e.target.value)} /></label>
          <label>Erros<input inputMode="numeric" type="number" min="0" value={form.errors} onChange={(e) => setNumber("errors", e.target.value)} /></label>
          <label>Acertos com dúvida<input inputMode="numeric" type="number" min="0" value={form.doubts} onChange={(e) => setNumber("doubts", e.target.value)} /></label>
        </div>

        <label className="notes-field">Observação opcional
          <textarea rows={2} maxLength={900} value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} placeholder="Ex.: dúvida em apreciar × julgar; revisar art. 74." />
        </label>

        <div className="progress-actions">
          <button className="primary button" type="submit" disabled={busy}>{busy ? "Sincronizando…" : "Salvar progresso"}</button>
          <span className="small">{message}</span>
        </div>
      </form>

      {queuedEvents().some((event) => event.dxx === day.dxx && event.localStatus === "conflict") ? (
        <details className="study-toggle">
          <summary>Eventos preservados com conflito</summary>
          <p className="small">Eles não alteram o estado canônico. Permanecem no dispositivo para auditoria local.</p>
        </details>
      ) : null}
    </article>
  );
}
