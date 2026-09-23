import type { Snapshot } from "../types";
import { ReviewWriteback } from "../ExecutionForms";
import { useOperational } from "./OperationalContext";
import { reviewQueues } from "./operations";
import { DataNotice, EmptyState, MetricCard, PageHeader, SectionHeader, StatusPill } from "./ui";
import { href } from "../v3/shared";

function ReviewCard({ review, bucket }: { review: ReturnType<typeof reviewQueues>["overdue"][number]; bucket: string }) {
  const tone = bucket === "overdue" ? "danger" : bucket === "today" ? "warning" : bucket === "completed" ? "success" : "neutral";
  const target = `/revisoes/?dxx=${encodeURIComponent(review.dxx)}&type=${encodeURIComponent(review.type)}&reason=${encodeURIComponent(review.reason || "Conteúdo novo")}#review-form`;
  return (
    <article className={`review-card-v4 bucket-${bucket}`}>
      <div className="review-card-head">
        <div><strong>{review.type} · {review.dxx}</strong><small>{review.reason || "Motivo não informado"}</small></div>
        <StatusPill tone={tone as "danger" | "warning" | "success" | "neutral"}>{review.status}</StatusPill>
      </div>
      <div className="review-card-data">
        <span><b>Prevista</b>{review.plannedDate?.slice(0,10) || "—"}</span>
        <span><b>Questões</b>{review.questions}</span>
        <span><b>Resultado</b>{review.correct}/{(review.correct ?? 0) + (review.errors ?? 0) || 0}</span>
      </div>
      {bucket !== "completed" ? <a href={href(target)}>Executar/atualizar →</a> : null}
    </article>
  );
}

export function RevisionsPageV4({ snapshot }: { snapshot: Snapshot }) {
  const { summary } = useOperational();
  const queues = reviewQueues(summary);

  return (
    <section className="aux-page revisions-v4">
      <PageHeader
        eyebrow="D0 · D7 · D20 · FATAL ERROR"
        title="Fila de revisões"
        description="Revisão aparece como compromisso operacional: origem, motivo, data e resultado. A fila não agenda nada por inferência."
        aside={<DataNotice canonical={summary.canonical} degraded={summary.degraded} generatedAt={summary.generatedAt} />}
      />

      <div className="metric-strip metric-strip-v4">
        <MetricCard label="ATRASADAS" value={queues.overdue.length} tone={queues.overdue.length ? "danger" : "default"} />
        <MetricCard label="PARA HOJE" value={queues.today.length} tone={queues.today.length ? "warning" : "default"} />
        <MetricCard label="PRÓXIMAS" value={queues.upcoming.length} />
        <MetricCard label="CONCLUÍDAS" value={queues.completed.length} tone="accent" />
      </div>

      {queues.overdue.length || queues.today.length ? (
        <section className="review-group-v4">
          <SectionHeader eyebrow="AGORA" title="Revisões que bloqueiam avanço" detail="Atrasadas primeiro; depois as previstas para hoje." />
          <div className="review-grid-v4">
            {queues.overdue.map((review) => <ReviewCard key={review.id} review={review} bucket="overdue" />)}
            {queues.today.map((review) => <ReviewCard key={review.id} review={review} bucket="today" />)}
          </div>
        </section>
      ) : (
        <EmptyState icon="✓" title="Nenhuma revisão vencida ou para hoje." description="O próximo compromisso permanece visível abaixo." />
      )}

      <section className="review-group-v4">
        <SectionHeader eyebrow="AGENDA" title="Próximas revisões" />
        {queues.upcoming.length ? (
          <div className="review-grid-v4">{queues.upcoming.slice(0,12).map((review) => <ReviewCard key={review.id} review={review} bucket="upcoming" />)}</div>
        ) : <EmptyState title="Nenhuma revisão futura programada no estado canônico." />}
      </section>

      {queues.unscheduled.length ? (
        <section className="review-group-v4">
          <SectionHeader eyebrow="SEM DATA" title="Revisões pendentes sem data prevista" />
          <div className="review-grid-v4">{queues.unscheduled.map((review) => <ReviewCard key={review.id} review={review} bucket="unscheduled" />)}</div>
        </section>
      ) : null}

      <details className="completed-reviews-v4">
        <summary>Histórico concluído ({queues.completed.length})</summary>
        <div className="review-grid-v4">{queues.completed.slice().reverse().map((review) => <ReviewCard key={review.id} review={review} bucket="completed" />)}</div>
      </details>

      <div id="review-form"><ReviewWriteback snapshot={snapshot} /></div>
    </section>
  );
}
