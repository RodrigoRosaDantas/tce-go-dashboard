import type { Snapshot } from "../types";
import { href } from "../v3/shared";
import { useOperational } from "./OperationalContext";
import { buildStudyIntelligence } from "./intelligence-core.mjs";
import { DataNotice, EmptyState, MetricCard, PageHeader, SectionHeader, StatusPill } from "./ui";

export function RisksPage({snapshot}:{snapshot:Snapshot}){
  const {summary}=useOperational(); const intel=buildStudyIntelligence({snapshot,summary});
  return <section className="aux-page risks-v5">
    <PageHeader eyebrow="RISCO · EVIDÊNCIA · IMPACTO" title="Riscos" description="Só aparece como risco o que possui sinal observável. Falta de dado fica em incerteza."
      aside={<DataNotice canonical={summary.canonical} degraded={summary.degraded} generatedAt={summary.generatedAt}/>} />
    <div className="metric-strip metric-strip-v4">
      <MetricCard label="RISCOS" value={intel.risks.length} tone={intel.risks.length?"warning":"default"}/>
      <MetricCard label="CRÍTICOS" value={intel.risks.filter((x:any)=>x.level==="critical").length} tone={intel.risks.some((x:any)=>x.level==="critical")?"danger":"default"}/>
      <MetricCard label="INCERTEZAS" value={intel.uncertainties.length}/>
      <MetricCard label="HORIZONTE" value={intel.exam.phase} detail={`${intel.exam.daysRemaining} dias`}/>
    </div>
    <section className="performance-panel"><SectionHeader eyebrow="MAPA DE RISCO" title="O que pode custar pontos" detail="Peso alto sem amostra só vira alerta quando há execução em curso ou proximidade suficiente da prova."/>
      {intel.risks.length?<div className="risk-list-v5">{intel.risks.map((r:any,i:number)=><article key={`${r.title}-${i}`}>
        <StatusPill tone={r.level==="critical"?"danger":"warning"}>{r.level==="critical"?"crítico":"atenção"}</StatusPill>
        <div><strong>{r.title}</strong><p>{r.detail}</p><small>{r.evidence.join(" · ")}</small></div>
        <a href={href(r.href)}>agir →</a>
      </article>)}</div>:<EmptyState title="Nenhum risco com evidência suficiente neste momento." description="Com os bancos de execução ainda vazios, o sistema evita inventar alarmes."/>}
    </section>
    <section className="performance-panel"><SectionHeader eyebrow="INCERTEZA ≠ RISCO" title="O que ainda precisa de amostra"/>
      {intel.uncertainties.length?<div className="uncertainty-grid-v5">{intel.uncertainties.map((u:any)=><article key={u.title}><strong>{u.title}</strong><p>{u.detail}</p></article>)}</div>:<EmptyState title="Sem incertezas relevantes no recorte atual."/>}
    </section>
  </section>;
}
