import type { Snapshot } from "../types";
import { formatDate, href, publishedDays } from "../v3/shared";
import { useOperational } from "./OperationalContext";
import { buildStudyIntelligence } from "./intelligence-core.mjs";
import { reviewQueues, progressMap, sessionState } from "./operations";
import { DataNotice, EmptyState, MetricCard, PageHeader, SectionHeader, StatusPill } from "./ui";

export function TodayPage({snapshot}:{snapshot:Snapshot}){
  const {summary}=useOperational(); const intel=buildStudyIntelligence({snapshot,summary}); const top=intel.recommendation;
  const reviews=reviewQueues(summary); const byProgress=progressMap(summary);
  const next=publishedDays(snapshot).find(day=>sessionState(byProgress.get(day.dxx))!=="completed");
  const agenda=intel.agenda.slice(0,6);
  return <section className="aux-page today-v5">
    <PageHeader eyebrow="HOJE · EXECUÇÃO IMEDIATA" title="Hoje" description="Uma tela curta para executar o que importa agora. A Home continua sendo consciência geral."
      aside={<DataNotice canonical={summary.canonical} degraded={summary.degraded} generatedAt={summary.generatedAt}/>} />
    <article className="today-command-v5">
      <span className="eyebrow">FAÇA AGORA</span><h2>{top.title}</h2><p>{top.reason}</p>
      <div className="mentor-evidence-v5">{top.evidence?.slice(0,4).map((x:string)=><span key={x}>{x}</span>)}</div>
      <a className="button primary large" href={href(top.href)}>Começar →</a>
    </article>
    <div className="metric-strip metric-strip-v4">
      <MetricCard label="REVISÕES VENCIDAS" value={reviews.overdue.length} tone={reviews.overdue.length?"warning":"default"}/>
      <MetricCard label="PARA HOJE" value={reviews.today.length}/>
      <MetricCard label="RISCOS ATIVOS" value={intel.risks.length} tone={intel.risks.length?"warning":"default"}/>
      <MetricCard label="PROVA" value={intel.exam.daysRemaining==null?"—":`${intel.exam.daysRemaining} dias`} detail={`${intel.exam.board} · ${intel.exam.phase}`}/>
    </div>
    <section className="today-flow-v5">
      <article className="performance-panel"><SectionHeader eyebrow="ORDEM DE EXECUÇÃO" title="Roteiro de hoje"/>
        <div className="today-steps-v5">
          <div><b>1</b><span><strong>{top.title}</strong><small>{top.eyebrow}</small></span><StatusPill tone="accent">agora</StatusPill></div>
          {top.after?<div><b>2</b><span><strong>{top.after.title}</strong><small>retomar a sequência canônica</small></span><a href={href(top.after.href)}>abrir →</a></div>:null}
          <div><b>{top.after?"3":"2"}</b><span><strong>Encerrar e registrar</strong><small>tempo, questões, acertos, erros e dúvidas somente se realmente executados</small></span></div>
        </div>
      </article>
      <aside className="performance-panel"><SectionHeader eyebrow="PRÓXIMA SESSÃO CANÔNICA" title={next?`${next.session} · ${next.dxx}`:"Trilha publicada concluída"}/>
        {next?<><p>{next.focus}</p><a className="button ghost" href={href(`/dia/${next.dxx.toLowerCase()}/`)}>Abrir sessão →</a></>:<EmptyState title="Nenhuma sessão publicada pendente."/>}
      </aside>
    </section>
    <section className="performance-panel today-agenda-v5">
      <SectionHeader eyebrow="AGENDA" title="Contexto temporal, não fila tirana" detail="A sequência pedagógica continua canônica; calendário apenas ajuda a enxergar marcos próximos." />
      <div className="today-agenda-list-v5">{agenda.map((item:any)=><a key={item.type+"-"+item.date+"-"+item.title} href={href(item.href)} className={"agenda-"+item.state}><time>{formatDate(item.date)}</time><span><strong>{item.type}{item.state==="overdue"?" · vencido":item.state==="today"?" · hoje":""}</strong><small>{item.title}</small></span><b>→</b></a>)}</div>
    </section>
  </section>;
}
