import type { Snapshot } from "../types";
import { useOperational } from "./OperationalContext";
import { progressMap, reviewQueues, sessionState } from "./operations";
import { buildStudyIntelligence } from "./intelligence-core.mjs";
import { DataNotice, EmptyState, MetricCard, PageHeader, SectionHeader, StatusPill } from "./ui";
import { formatDate, href, publishedDays } from "../v3/shared";

export function FinalSprintPageV4({ snapshot }: { snapshot: Snapshot }) {
  const { summary } = useOperational();
  const rows = snapshot.finalSprint ?? [];
  const intel = buildStudyIntelligence({ snapshot, summary });
  const reviews = reviewQueues(summary);
  const byProgress = progressMap(summary);
  const incomplete = publishedDays(snapshot).filter((day)=>sessionState(byProgress.get(day.dxx))!=="completed");

  const priorities = intel.weaknesses.slice(0, 6);


  return (
    <section className="aux-page final-sprint-v4">
      <PageHeader
        eyebrow="PÓS-D100 · ORIENTADA POR DADOS"
        title="Reta final"
        description="O calendário permanece D100 + 17 dias finais; as prioridades abaixo vêm dos erros, revisões e sessões realmente acumulados."
        aside={<DataNotice canonical={summary.canonical} degraded={summary.degraded} generatedAt={summary.generatedAt} />}
      />

      <div className="metric-strip metric-strip-v4">
        <MetricCard label="RISCOS COM EVIDÊNCIA" value={intel.risks.length} tone={intel.risks.some((item: any)=>item.level==="critical") ? "danger" : intel.risks.length ? "warning" : "default"} />
        <MetricCard label="REVISÕES ATRASADAS" value={reviews.overdue.length} tone={reviews.overdue.length ? "warning" : "default"} />
        <MetricCard label="SESSÕES PUBLICADAS PENDENTES" value={incomplete.length} />
        <MetricCard label="DIAS DE RETA FINAL" value={rows.length} tone="accent" />
      </div>

      <section className="sprint-priority-v4">
        <SectionHeader eyebrow="ENTRADAS DO D100" title="Prioridades atuais para a reta final" detail="Ordenadas por sinais existentes; não cria conteúdo ou peso novo." />
        {priorities.length ? <div className="weak-signals-v4">
          {priorities.map((item: any,index: number)=><article key={item.id}>
            <b>{String(index+1).padStart(2,"0")}</b><div><strong>{item.subject} · {item.topic}</strong><small>{item.score}/100 · {item.recurrence} reincidência(s) · {item.confidence.label}</small></div>
            <a href={href("/mentor/")}>Ver evidências →</a>
          </article>)}
        </div> : <EmptyState title="Sem tópicos de erro suficientes para priorização." description="A reta final seguirá o calendário até que dados reais indiquem ajustes." />}
      </section>

      {intel.risks.length || reviews.overdue.length ? (
        <div className="sprint-alerts-v4">
          {intel.risks.some((item: any)=>item.level==="critical") ? <a href={href("/riscos/")}><StatusPill tone="danger">Risco crítico</StatusPill><span>Tratar a evidência crítica antes de expansão aleatória.</span><b>→</b></a> : null}
          {reviews.overdue.length ? <a href={href("/revisoes/")}><StatusPill tone="warning">{reviews.overdue.length} atrasada(s)</StatusPill><span>Regularizar retenção conforme prioridade do Mentor.</span><b>→</b></a> : null}
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
