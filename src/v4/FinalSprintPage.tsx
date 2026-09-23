import type { Snapshot } from "../types";
import { useOperational } from "./OperationalContext";
import { criticalErrors, isOpenError, progressMap, reviewQueues, sessionState } from "./operations";
import { DataNotice, EmptyState, MetricCard, PageHeader, SectionHeader, StatusPill } from "./ui";
import { formatDate, href, publishedDays } from "../v3/shared";

export function FinalSprintPageV4({ snapshot }: { snapshot: Snapshot }) {
  const { summary } = useOperational();
  const rows = snapshot.finalSprint ?? [];
  const critical = criticalErrors(summary);
  const reviews = reviewQueues(summary);
  const openErrors = summary.errors.filter(isOpenError);
  const byProgress = progressMap(summary);
  const incomplete = publishedDays(snapshot).filter((day)=>sessionState(byProgress.get(day.dxx))!=="completed");

  const topics = new Map<string,{ label:string; open:number; critical:number; recurrence:number }>();
  for (const error of openErrors) {
    const label=[error.subject,error.topic].filter(Boolean).join(" · ") || error.error || "Sem tópico";
    const current=topics.get(label)||{label,open:0,critical:0,recurrence:0};
    current.open+=1;
    current.critical+=Number(error.fatal||error.severity==="P1");
    current.recurrence+=error.recurrence||0;
    topics.set(label,current);
  }
  const priorities=[...topics.values()]
    .sort((a,b)=>b.critical-a.critical||b.recurrence-a.recurrence||b.open-a.open||a.label.localeCompare(b.label,"pt-BR"))
    .slice(0,6);

  return (
    <section className="aux-page final-sprint-v4">
      <PageHeader
        eyebrow="PÓS-D100 · ORIENTADA POR DADOS"
        title="Reta final"
        description="O calendário permanece D100 + 17 dias finais; as prioridades abaixo vêm dos erros, revisões e sessões realmente acumulados."
        aside={<DataNotice canonical={summary.canonical} degraded={summary.degraded} generatedAt={summary.generatedAt} />}
      />

      <div className="metric-strip metric-strip-v4">
        <MetricCard label="ERROS CRÍTICOS" value={critical.length} tone={critical.length ? "danger" : "default"} />
        <MetricCard label="REVISÕES ATRASADAS" value={reviews.overdue.length} tone={reviews.overdue.length ? "warning" : "default"} />
        <MetricCard label="SESSÕES PUBLICADAS PENDENTES" value={incomplete.length} />
        <MetricCard label="DIAS DE RETA FINAL" value={rows.length} tone="accent" />
      </div>

      <section className="sprint-priority-v4">
        <SectionHeader eyebrow="ENTRADAS DO D100" title="Prioridades atuais para a reta final" detail="Ordenadas por sinais existentes; não cria conteúdo ou peso novo." />
        {priorities.length ? <div className="weak-signals-v4">
          {priorities.map((item,index)=><article key={item.label}>
            <b>{String(index+1).padStart(2,"0")}</b><div><strong>{item.label}</strong><small>{item.critical} crítico(s) · {item.recurrence} reincidência(s) · {item.open} erro(s) aberto(s)</small></div>
            <a href={href("/erros/")}>Abrir erros →</a>
          </article>)}
        </div> : <EmptyState title="Sem tópicos de erro suficientes para priorização." description="A reta final seguirá o calendário até que dados reais indiquem ajustes." />}
      </section>

      {critical.length || reviews.overdue.length ? (
        <div className="sprint-alerts-v4">
          {critical.length ? <a href={href("/erros/")}><StatusPill tone="danger">{critical.length} P1/Fatal</StatusPill><span>Tratar erros críticos antes de expandir revisão.</span><b>→</b></a> : null}
          {reviews.overdue.length ? <a href={href("/revisoes/")}><StatusPill tone="warning">{reviews.overdue.length} atrasada(s)</StatusPill><span>Regularizar retenção vencida.</span><b>→</b></a> : null}
        </div>
      ) : null}

      <section>
        <SectionHeader eyebrow="CALENDÁRIO" title="17 dias finais preservados" />
        {rows.length ? <div className="sprint-list">{rows.map((item)=>(
          <article key={item.code}><div className="sprint-code">{item.code}</div><div><strong>{item.title}</strong><span>{item.type}</span></div><time>{formatDate(item.date)}</time></article>
        ))}</div> : <EmptyState title="Calendário de reta final não disponível." />}
      </section>
    </section>
  );
}
