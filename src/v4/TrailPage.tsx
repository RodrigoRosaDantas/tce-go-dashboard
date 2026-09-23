import { useMemo, useState } from "react";
import type { Snapshot } from "../types";
import { useOperational } from "./OperationalContext";
import { errorsForDay, progressMap, reviewBucket, reviewsForDay, sessionState } from "./operations";
import { DataNotice, MetricCard, PageHeader, StatusPill } from "./ui";
import { activeDays, formatDate, hasPublicSession, href } from "../v3/shared";

type Filter = "all" | "pending" | "reviews" | "critical";

export function TrailPageV4({ snapshot }: { snapshot: Snapshot }) {
  const { summary } = useOperational();
  const [filter, setFilter] = useState<Filter>("all");
  const active = activeDays(snapshot);
  const protectedDays = snapshot.days.filter((day) => day.protected);
  const byProgress = progressMap(summary);

  const rows = useMemo(() => active.map((day, index) => {
    const progress = byProgress.get(day.dxx);
    const reviews = reviewsForDay(summary, day.dxx);
    const overdue = reviews.filter((review) => ["overdue","today"].includes(reviewBucket(review))).length;
    const errors = errorsForDay(summary, day.dxx);
    const critical = errors.filter((error) => error.fatal || error.severity === "P1").length;
    return {
      day,index,progress,reviews,overdue,errors,critical,
      ready: hasPublicSession(snapshot, day),
      state: sessionState(progress),
    };
  }), [active, byProgress, snapshot, summary]);

  const visible = rows.filter((row) => {
    if (filter === "pending") return row.state !== "completed";
    if (filter === "reviews") return row.reviews.length > 0;
    if (filter === "critical") return row.critical > 0;
    return true;
  });

  const completed = rows.filter((row) => row.state === "completed").length;
  const inProgress = rows.filter((row) => row.state === "in-progress").length;
  const reviewSignals = rows.reduce((sum, row) => sum + row.overdue, 0);
  const criticalSignals = rows.reduce((sum, row) => sum + row.critical, 0);

  return (
    <section className="trail-page-v4">
      <PageHeader
        eyebrow="S01–S47 · MAPA OPERACIONAL"
        title="Trilha de estudo"
        description="A ordem pedagógica continua canônica; cada sessão agora mostra o estado real de execução, retenção e erros."
        aside={<DataNotice canonical={summary.canonical} degraded={summary.degraded} generatedAt={summary.generatedAt} />}
      />

      <div className="metric-strip metric-strip-v4">
        <MetricCard label="CONCLUÍDAS" value={completed} detail={`de ${active.length} sessões ativas`} tone="accent" />
        <MetricCard label="EM ANDAMENTO" value={inProgress} detail="execução real ainda aberta" />
        <MetricCard label="REVISÕES SINALIZADAS" value={reviewSignals} detail="atrasadas ou para hoje" tone={reviewSignals ? "warning" : "default"} />
        <MetricCard label="ERROS CRÍTICOS" value={criticalSignals} detail="P1 ou Fatal Error" tone={criticalSignals ? "danger" : "default"} />
      </div>

      <div className="trail-toolbar-v4">
        <div className="segmented-v4" role="group" aria-label="Filtrar trilha">
          {([
            ["all","Todas"],
            ["pending","Pendentes"],
            ["reviews","Com revisão"],
            ["critical","Críticas"],
          ] as Array<[Filter,string]>).map(([value,label]) => (
            <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        <span>{visible.length} sessão(ões) exibida(s)</span>
      </div>

      <div className="trail-timeline trail-timeline-v4">
        {visible.map(({ day,index,progress,reviews,overdue,errors,critical,ready,state }) => {
          const total = (progress?.correct ?? 0) + (progress?.errors ?? 0);
          const accuracy = total ? Math.round(((progress?.correct ?? 0) / total) * 100) : null;
          return (
            <article className={`trail-session trail-session-v4 ${ready ? "ready" : ""} state-${state}`} key={day.dxx}>
              <div className="timeline-marker"><span>{String(index + 1).padStart(2,"0")}</span><i /></div>
              <div className="trail-session-main">
                <div className="trail-session-meta">
                  <strong>{day.session} · {day.dxx}</strong>
                  <span>{formatDate(day.date)}</span>
                  <span>{day.type}</span>
                </div>
                <h2>{day.focus}</h2>
                <div className="trail-state-row">
                  <StatusPill tone={state === "completed" ? "success" : state === "in-progress" ? "accent" : "neutral"}>
                    {state === "completed" ? "Concluída" : state === "in-progress" ? "Em andamento" : "Não iniciada"}
                  </StatusPill>
                  {overdue ? <StatusPill tone="warning">{overdue} revisão(ões) agora</StatusPill> : reviews.length ? <StatusPill tone="neutral">{reviews.length} revisão(ões)</StatusPill> : null}
                  {critical ? <StatusPill tone="danger">{critical} erro(s) crítico(s)</StatusPill> : errors.length ? <StatusPill tone="neutral">{errors.length} erro(s) aberto(s)</StatusPill> : null}
                </div>
              </div>
              <div className="trail-session-metrics">
                <div><span>Tempo</span><strong>{progress?.timeMinutes ?? 0} min</strong></div>
                <div><span>Questões</span><strong>{progress?.questionsDone ?? 0}</strong></div>
                <div><span>Acerto</span><strong>{accuracy === null ? "—" : `${accuracy}%`}</strong></div>
              </div>
              <div className="trail-session-actions">
                <span className={ready ? "status-chip success" : "status-chip"}>{ready ? "Publicado" : "Aguardando"}</span>
                {ready ? <a className="button secondary small" href={href(`/dia/${day.dxx.toLowerCase()}/`)}>{state === "in-progress" ? "Retomar" : "Abrir"} →</a> : null}
              </div>
            </article>
          );
        })}
      </div>

      <details className="calendar-details">
        <summary>Calendário D001–D100 · {protectedDays.length} dias protegidos</summary>
        <div className="calendar-grid">
          {[...snapshot.days].sort((a,b) => a.order - b.order).map((day) => {
            const progress = byProgress.get(day.dxx);
            return (
              <div key={day.dxx} className={day.protected ? "protected" : progress?.completed ? "active completed" : "active"}>
                <strong>{day.dxx}</strong><span>{formatDate(day.date)}</span><small>{day.protected ? "Protegido" : day.session}</small>
              </div>
            );
          })}
        </div>
      </details>
    </section>
  );
}
