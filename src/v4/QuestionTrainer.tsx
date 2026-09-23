import { useMemo, useState } from "react";
import type { DaySnapshot, QuestionSnapshot } from "../types";
import { href } from "../v3/shared";

type Confidence = "certeza" | "dúvida" | "chute";
type AnswerState = Record<string, { answer: string; confidence: Confidence }>;

function key(qxx: string) {
  return `tce-go.v4.question-trainer.${qxx}`;
}

function resultKey(dxx: string) {
  return `tce-go.v4.question-result.${dxx}`;
}

function readState(qxx: string): AnswerState {
  try {
    const raw = localStorage.getItem(key(qxx));
    return raw ? JSON.parse(raw) as AnswerState : {};
  } catch {
    return {};
  }
}

function writeState(qxx: string, value: AnswerState) {
  try { localStorage.setItem(key(qxx), JSON.stringify(value)); } catch { /* storage indisponível */ }
}

export function AuthorialTrainer({ question, day }: { question: QuestionSnapshot; day: DaySnapshot }) {
  const items = question.authorialItems ?? [];
  const [answers, setAnswers] = useState<AnswerState>(() => readState(question.qxx));
  const [reveal, setReveal] = useState(false);
  const [fccAttempted, setFccAttempted] = useState("");
  const [fccCorrect, setFccCorrect] = useState("");
  const [fccDoubts, setFccDoubts] = useState("");
  const [message, setMessage] = useState("");

  const authorial = useMemo(() => items.map((item) => {
    const answer = answers[item.id];
    const correct = Boolean(reveal && answer?.answer && item.answer && answer.answer === item.answer);
    return { item, answer, correct };
  }), [answers, items, reveal]);

  if (!items.length) return null;

  const allAnswered = items.every((item) => Boolean(answers[item.id]?.answer));
  const fccMax = Math.max(0, question.valid - items.length);
  const authorialCorrect = reveal ? authorial.filter((entry) => entry.correct).length : 0;
  const authorialDoubts = reveal ? authorial.filter((entry) => entry.correct && entry.answer?.confidence !== "certeza").length : 0;

  function update(id: string, patch: Partial<{ answer: string; confidence: Confidence }>) {
    const current = answers[id] ?? { answer: "", confidence: "certeza" as Confidence };
    const next = { ...answers, [id]: { ...current, ...patch } };
    setAnswers(next);
    writeState(question.qxx, next);
  }

  function sendToClosing() {
    const attempted = Number(fccAttempted || 0);
    const correct = Number(fccCorrect || 0);
    const doubts = Number(fccDoubts || 0);
    if (!Number.isFinite(attempted) || !Number.isFinite(correct) || !Number.isFinite(doubts) || attempted < 0 || correct < 0 || doubts < 0) {
      setMessage("Preencha a métrica FCC com números válidos.");
      return;
    }
    if (attempted > fccMax) {
      setMessage(`A métrica FCC deste Qxx comporta no máximo ${fccMax} item(ns); os ${items.length} autorais são contados separadamente.`);
      return;
    }
    if (correct > attempted) {
      setMessage("Acertos FCC não podem exceder itens respondidos.");
      return;
    }
    if (doubts > correct) {
      setMessage("Acertos com dúvida FCC não podem exceder acertos.");
      return;
    }
    if (!reveal) {
      setMessage("Corrija os itens autorais antes de enviar o resultado ao fechamento.");
      return;
    }

    const authorialDone = authorial.filter((entry) => entry.answer?.answer).length;
    const questionsDone = attempted + authorialDone;
    const totalCorrect = correct + authorialCorrect;
    const result = {
      dxx: day.dxx,
      qxx: question.qxx,
      questionsDone,
      correct: totalCorrect,
      errors: Math.max(0, questionsDone - totalCorrect),
      doubts: doubts + authorialDoubts,
      fcc: { attempted, correct, doubts },
      authorial: { attempted: authorialDone, correct: authorialCorrect, doubts: authorialDoubts },
      savedAt: new Date().toISOString(),
    };
    try { localStorage.setItem(resultKey(day.dxx), JSON.stringify(result)); } catch { /* storage indisponível */ }
    window.dispatchEvent(new CustomEvent("tce-question-result", { detail: result }));
    window.location.href = href(`/dia/${day.dxx.toLowerCase()}/#registro`);
  }

  return (
    <section className="authorial-trainer-v4">
      <header>
        <div><span className="eyebrow">MODO BATERIA AUTORAL</span><h2>{items.length} item(ns) publicável(is)</h2><p>Resposta e confiança ficam locais até você enviar o resumo ao fechamento.</p></div>
        <span className="status-chip">{reveal ? `${authorialCorrect}/${items.length}` : "gabarito oculto"}</span>
      </header>

      <div className="authorial-items-v4">
        {authorial.map(({ item, answer, correct }) => (
          <article className={`authorial-item-v4 ${reveal ? (correct ? "correct" : "wrong") : ""}`} key={item.id}>
            <div className="authorial-item-head"><span>{item.number}</span><div><strong>{item.id}</strong><small>{item.title}</small></div></div>
            <p className="authorial-prompt-v4">{item.prompt}</p>
            <div className="authorial-choices-v4">
              {item.choices.map((choice) => (
                <label key={choice.key} className={answer?.answer === choice.key ? "selected" : ""}>
                  <input type="radio" name={item.id} value={choice.key} checked={answer?.answer === choice.key} disabled={reveal} onChange={() => update(item.id,{answer:choice.key})} />
                  <b>{choice.key}</b><span>{choice.text}</span>
                </label>
              ))}
            </div>
            <label className="confidence-v4">Confiança
              <select value={answer?.confidence || "certeza"} disabled={reveal} onChange={(event) => update(item.id,{confidence:event.target.value as Confidence})}>
                <option value="certeza">Certeza</option>
                <option value="dúvida">Dúvida</option>
                <option value="chute">Chute</option>
              </select>
            </label>
            {reveal ? (
              <div className={`authorial-correction-v4 ${correct ? "correct" : "wrong"}`}>
                <strong>{correct ? "✓ Correta" : `✕ Gabarito: ${item.answer || "—"}`}</strong>
                {item.rationale ? <p>{item.rationale}</p> : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <div className="trainer-actions-v4">
        <button type="button" className="button secondary" disabled={!allAnswered || reveal} onClick={() => setReveal(true)}>
          {reveal ? "Correção revelada" : "Corrigir itens autorais"}
        </button>
        {!allAnswered ? <small>Responda todos os itens autorais antes de abrir o gabarito.</small> : null}
      </div>

      <section className="fcc-summary-v4">
        <div><span className="eyebrow">FCC POR REFERÊNCIA</span><h3>Resumo da execução externa</h3><p>Não reproduzimos os enunciados. Informe apenas sua métrica depois de resolver pelos links/localizadores. Máximo neste caderno: {fccMax} FCC.</p></div>
        <div className="fcc-summary-fields-v4">
          <label>Respondidas<input type="number" min="0" max={fccMax} value={fccAttempted} onChange={(event)=>setFccAttempted(event.target.value)} /></label>
          <label>Acertos<input type="number" min="0" value={fccCorrect} onChange={(event)=>setFccCorrect(event.target.value)} /></label>
          <label>Acertos com dúvida<input type="number" min="0" value={fccDoubts} onChange={(event)=>setFccDoubts(event.target.value)} /></label>
        </div>
      </section>

      <footer className="trainer-footer-v4">
        <div><strong>Resultado autoral</strong><span>{reveal ? `${authorialCorrect}/${items.length} · ${authorialDoubts} acerto(s) com dúvida` : "aguardando correção"}</span></div>
        <button type="button" className="button primary" onClick={sendToClosing}>Enviar resumo ao fechamento →</button>
        {message ? <span className="trainer-message-v4">{message}</span> : null}
      </footer>
    </section>
  );
}
