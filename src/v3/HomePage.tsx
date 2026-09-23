import type { Snapshot } from "../types";
import { conflictCount, pendingCount } from "../progress";
import { useOperational } from "../v4/OperationalContext";
import { DataNotice, MetricCard, SectionHeader, StatusPill } from "../v4/ui";
import { criticalErrors, deriveDecision, progressMap, reviewQueues, sessionState } from "../v4/operations";
import { activeDays, formatDate, href, publishedDays } from "./shared";

export function HomePage({ snapshot }: { snapshot: Snapshot }) {
  const { summary, loading, connected, refresh } = useOperational();
  const published = publishedDays(snapshot);
  const active = activeDays(snapshot);
  const byProgress = progressMap(summary);
  const decision = deriveDecision(snapshot, summary);
  const reviews = reviewQueues(summary);
  const critical = criticalErrors(summary);
  const pending = pendingCount();
  const conflicts = conflictCount();

  const completed = published.filter((day) => sessionState(byProgress.get(day.dxx)) === "completed").length;
  const studied = summary.progress.filter((state) => state.studied).length;
  const minutes = summary.progress.reduce((sum, state) => sum + (state.timeMinutes || 0), 0);
  const questions = summary.progress.reduce((sum, state) => sum + (state.questionsDone || 0), 0);
  const correct = summary.progress.reduce((sum, state) => sum + (state.correct || 0), 0);
  const errors = summary.progress.reduce((sum, state) => sum + (state.errors || 0), 0);
  const doubts = summary.progress.reduce((sum, state) => sum + (state.doubts || 0), 0);
  const accuracy = correct + errors > 0 ? Math.round((correct / (correct + errors)) * 100) : null;
  const executionPct = published.length ? Math.round((completed / published.length) * 100) : 0;

  const nextSession = published.find((day) => sessionState(byProgress.get(day.dxx)) !== "completed");
  const nextIndex = nextSession ? active.findIndex((day) => day.dxx === nextSession.dxx) : -1;
  const after = nextIndex >= 0 ? active[nextIndex + 1] : undefined;
  const lastProgress = [...summary.progress]
    .filter((state) => state.studied || state.completed || state.timeMinutes || state.questionsDone)
    .sort((a, b) => String(b.eventOccurredAt || b.confirmedAt || "").localeCompare(String(a.eventOccurredAt || a.confirmedAt || "")))[0];

  return (
    <section className="home-dashboard home-v4">
      <div className="home-state-row">
        <DataNotice canonical={summary.canonical} degraded={summary.degraded} generatedAt={summary.generatedAt} />
        <div className="home-state-actions">
          <span>{connected ? "Conta privada conectada" : "Sem conta privada"}</span>
          <button type="button" className="text-action" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Atualizando…" : "Atualizar estado"}
          </button>
        </div>
      </div>

      <div className="home-command-grid">
        <article className={`decision-card decision-${decision.kind}`}>
          <header className="decision-head">
            <div>
              <span className="status-dot" />
              <span>{decision.eyebrow}</span>
            </div>
            {decision.badge ? <span className="date-pill">{decision.badge}</span> : null}
          </header>

          <div className="decision-copy">
            <div className="session-meta">
              {decision.dxx ? <span>{decision.dxx}</span> : null}
              <span>{decision.kind.replaceAll("-", " ")}</span>
            </div>
            <h1>{decision.title}</h1>
            <p>{decision.reason}</p>
            <div className="decision-explain">
              <span>Por que agora?</span>
              <strong>
                {decision.kind === "critical-error" ? "Erro crítico prevalece sobre matéria nova." :
                 decision.kind === "overdue-review" ? "Retenção vencida prevalece sobre avanço." :
                 decision.kind === "resume" ? "Concluir o que já foi iniciado reduz fragmentação." :
                 decision.kind === "redaction" ? "Marco de redação vencido na agenda canônica." :
                 decision.kind === "simulation" ? "Checkpoint vencido sem execução confirmada." :
                 decision.kind === "next-session" ? "Nenhuma pendência de maior prioridade foi encontrada." :
                 "Trilha corrente sem bloqueio prioritário."}
              </strong>
            </div>
            <div className="decision-actions">
              <a className="button primary large" href={href(decision.href)}>
                Executar agora <span>→</span>
              </a>
              {nextSession && decision.kind !== "next-session" ? (
                <a className="button ghost" href={href(`/dia/${nextSession.dxx.toLowerCase()}/`)}>
                  Próxima sessão: {nextSession.session}
                </a>
              ) : null}
            </div>
          </div>

          <footer className="decision-footer decision-signals">
            <span><b>{reviews.overdue.length}</b> revisão atrasada</span>
            <i />
            <span><b>{critical.length}</b> erro crítico</span>
            <i />
            <span><b>{pending}</b> evento pendente</span>
            <i />
            <span><b>{conflicts}</b> conflito</span>
          </footer>
        </article>

        <aside className="pulse-card">
          <header><span>PULSO DO PROJETO</span><strong>{executionPct}%</strong></header>
          <div className="ring" style={{ "--progress": `${executionPct * 3.6}deg` } as React.CSSProperties}>
            <div><strong>{completed}</strong><span>de {published.length}</span></div>
          </div>
          <div className="pulse-lines">
            <div><span>Sessões com estudo</span><strong>{studied}</strong></div>
            <div><span>Tempo registrado</span><strong>{Math.floor(minutes / 60)}h {minutes % 60}min</strong></div>
            <div><span>Questões feitas</span><strong>{questions}</strong></div>
            <div><span>Aproveitamento</span><strong>{accuracy === null ? "—" : `${accuracy}%`}</strong></div>
            <div><span>Acertos com dúvida</span><strong>{doubts}</strong></div>
          </div>
          <a href={href("/desempenho/")}>Abrir diagnóstico <span>→</span></a>
        </aside>
      </div>

      <div className="metric-strip metric-strip-v4">
        <MetricCard label="REVISÕES ATRASADAS" value={reviews.overdue.length} detail={reviews.today.length ? `+${reviews.today.length} para hoje` : "Nenhuma adicional hoje"} tone={reviews.overdue.length ? "warning" : "default"} />
        <MetricCard label="ERROS CRÍTICOS" value={critical.length} detail={critical.filter((item) => item.fatal).length ? "Há Fatal Error aberto" : "P1/Fatal"} tone={critical.length ? "danger" : "default"} />
        <MetricCard label="EXECUÇÃO REAL" value={completed} detail={`${published.length} sessões publicadas`} tone="accent" />
        <MetricCard label="SINCRONIZAÇÃO" value={conflicts ? `${conflicts} conflito(s)` : pending ? `${pending} pendente(s)` : "Em dia"} detail={summary.canonical ? "Notion carregado" : "Usando cache"} tone={conflicts ? "danger" : pending ? "warning" : "default"} />
      </div>

      <section className="operational-grid">
        <article className="plan-card priority-queue-card">
          <SectionHeader
            eyebrow="FILA OPERACIONAL"
            title="Depois da prioridade atual"
            detail="A ordem abaixo é derivada do estado confirmado; não cria metas novas."
            action={<a href={href("/revisoes/")}>Abrir revisões</a>}
          />
          <div className="priority-queue">
            <a href={href("/revisoes/")} className={reviews.overdue.length ? "queue-item urgent" : "queue-item"}>
              <span>01</span><div><strong>Revisões</strong><small>{reviews.overdue.length} atrasada(s) · {reviews.today.length} hoje · {reviews.upcoming.length} próxima(s)</small></div><b>→</b>
            </a>
            <a href={href("/erros/")} className={critical.length ? "queue-item danger" : "queue-item"}>
              <span>02</span><div><strong>Erros</strong><small>{summary.errors.filter((item) => !["Validado","Encerrado"].includes(item.status)).length} aberto(s) · {critical.length} crítico(s)</small></div><b>→</b>
            </a>
            {nextSession ? (
              <a href={href(`/dia/${nextSession.dxx.toLowerCase()}/`)} className="queue-item">
                <span>03</span><div><strong>{nextSession.session} · {nextSession.dxx}</strong><small>{nextSession.focus}</small></div><b>→</b>
              </a>
            ) : (
              <div className="queue-item"><span>03</span><div><strong>Trilha publicada concluída</strong><small>Nenhuma Sxx publicada pendente.</small></div></div>
            )}
          </div>
        </article>

        <aside className="continuity-card">
          <span className="eyebrow">CONTINUIDADE</span>
          <h2>Visão rápida</h2>
          {after ? (
            <>
              <strong>{after.session} · {after.dxx}</strong>
              <p>{after.focus}</p>
              <span className="muted">{formatDate(after.date)} · {after.type}</span>
            </>
          ) : <p>Não há sessão posterior ativa na trilha atual.</p>}
          <hr />
          <span className="eyebrow">ÚLTIMO ESTADO CONFIRMADO</span>
          {lastProgress ? (
            <>
              <strong>{lastProgress.sxx || "Sessão"} · {lastProgress.dxx}</strong>
              <p>{lastProgress.completed ? "Concluída" : "Em andamento"} · {lastProgress.timeMinutes} min · {lastProgress.questionsDone} questões</p>
              <StatusPill tone={lastProgress.canonical ? "success" : "warning"}>{lastProgress.canonical ? "Canônico" : "Cache"}</StatusPill>
            </>
          ) : <p>Nenhuma execução real registrada ainda.</p>}
        </aside>
      </section>
    </section>
  );
}
