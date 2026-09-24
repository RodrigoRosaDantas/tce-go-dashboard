import type { Snapshot } from "../types";
import { href } from "../v3/shared";
import { useOperational } from "./OperationalContext";
import { buildStudyIntelligence } from "./intelligence-core.mjs";
import { DataNotice, EmptyState, MetricCard, PageHeader, SectionHeader, StatusPill } from "./ui";

const tone=(level:string): "danger" | "warning" | "neutral" => level==="crítica"?"danger":level==="alta"?"warning":"neutral";
export function MentorPage({snapshot}:{snapshot:Snapshot}){
  const {summary}=useOperational();
  const intel=buildStudyIntelligence({snapshot,summary});
  const top=intel.recommendation;
  return <section className="aux-page mentor-v5">
    <PageHeader eyebrow="MENTOR TCE-GO · DECISÃO EXPLICÁVEL" title="Mentor"
      description="Transforma execução real, retenção, erros e o peso do edital em orientação. Ausência continua sendo ausência."
      aside={<DataNotice canonical={summary.canonical} degraded={summary.degraded} generatedAt={summary.generatedAt}/>} />
    <article className="mentor-action-v5">
      <div className="mentor-action-copy">
        <span className="eyebrow">{top.eyebrow}</span>
        <h2>{top.title}</h2><p>{top.reason}</p>
        <div className="mentor-evidence-v5">{top.evidence?.map((x:string)=><span key={x}>{x}</span>)}</div>
        <div className="decision-actions"><a className="button primary large" href={href(top.href)}>Executar agora →</a>
          {top.after?<a className="button ghost" href={href(top.after.href)}>Depois: {top.after.title}</a>:null}
        </div>
      </div>
      <div className="mentor-score-v5"><strong>{top.score}</strong><small>prioridade /100</small><span>{intel.exam.daysRemaining} dias para a prova</span></div>
      <details className="mentor-method-v5"><summary>Como essa prioridade foi calculada?</summary>
        <p>{intel.methodology.priority}</p>
        {top.breakdown?<div className="mentor-breakdown-v5">{Object.entries(top.breakdown).map(([k,v]:any)=><span key={k}><b>{k}</b>{typeof v==="object"?`${v.points}/${v.max}`:String(v)}</span>)}</div>:null}
      </details>
    </article>

    <div className="metric-strip metric-strip-v4">
      <MetricCard label="FRAGILIDADES" value={intel.weaknesses.length} detail={intel.weaknesses.length?"com evidência registrada":"nenhuma ainda"} tone={intel.weaknesses.some((x:any)=>x.score>=75)?"danger":"default"}/>
      <MetricCard label="FORÇAS" value={intel.strengths.length} detail="somente com amostra suficiente" tone="accent"/>
      <MetricCard label="RISCOS" value={intel.risks.length} detail="sempre com evidência" tone={intel.risks.length?"warning":"default"}/>
      <MetricCard label="FASE" value={intel.exam.phase} detail={`${intel.exam.board} · ${intel.exam.objectiveQuestions} questões · ${intel.exam.weightedPoints} pts`}/>
    </div>

    <section className="mentor-grid-v5">
      <article className="performance-panel">
        <SectionHeader eyebrow="FRAGILIDADES" title="Onde a evidência pede intervenção" detail="Score não é nota de capacidade; é prioridade operacional."/>
        {intel.weaknesses.length?<div className="mentor-list-v5">{intel.weaknesses.slice(0,8).map((w:any)=><article key={w.id}>
          <div><strong>{w.subject} · {w.topic}</strong><small>{w.evidence.slice(0,3).join(" · ")}</small></div>
          <StatusPill tone={tone(w.level)}>{w.level} · {w.score}/100</StatusPill>
          <details><summary>Ver evidências</summary><ul>{w.evidence.map((e:string)=><li key={e}>{e}</li>)}</ul><p>{w.trend.label} · {w.confidence.label}</p></details>
        </article>)}</div>:<EmptyState title="Nenhuma fragilidade real registrada." description="Antes da primeira execução, isso significa apenas que não há amostra — não que o conteúdo esteja dominado."/>}
      </article>

      <article className="performance-panel">
        <SectionHeader eyebrow="FORÇAS" title="O que está funcionando" detail="O sistema só reconhece força quando precisão e amostra sustentam a afirmação."/>
        {intel.strengths.length?<div className="mentor-list-v5">{intel.strengths.map((s:any)=><article key={s.subject}>
          <div><strong>{s.subject}</strong><small>{s.accuracy?.toFixed(1)}% · {s.questions} questões · {s.sessions} sessões</small></div>
          <StatusPill tone="success">{s.level}</StatusPill>
        </article>)}</div>:<EmptyState title="Ainda sem força estatisticamente sustentada." description="100% em poucas questões continuará aparecendo como amostra pequena."/>}
      </article>
    </section>

    <section className="mentor-grid-v5">
      <article className="performance-panel">
        <SectionHeader eyebrow="REDAÇÃO FCC" title="Correção também entra na estratégia" />
        {intel.writing.count ? <>
          <strong>{intel.writing.latest?.title || intel.writing.latest?.dxx || "Última redação"}</strong>
          <p>{intel.writing.productionPending ? "Redação em produção: concluir o texto antes de abrir outra frente discursiva." : intel.writing.correctionPending ? "Correção pendente: o texto foi produzido, mas ainda não recebeu nota/diagnóstico." : intel.writing.rewriteNeeded ? intel.writing.pendingRewriteCount + " reescrita(s) pendente(s)." : "Sem correção ou reescrita pendente."} {intel.writing.trend.label}{intel.writing.trend.delta==null?"":" · "+(intel.writing.trend.delta>0?"+":"")+intel.writing.trend.delta.toFixed(1)+" p.p."}.</p>
          <div className="mentor-evidence-v5">
            {intel.writing.productionPending ? <span>status Em produção · concluir redação</span> : null}
            {intel.writing.correctionPending ? <span>status Produzida · correção ainda necessária</span> : null}
            {intel.writing.weakestCriterion ? <span>critério mais frágil: {intel.writing.weakestCriterion.label} · {intel.writing.weakestCriterion.value}/{intel.writing.weakestCriterion.max}</span> : <span>critérios ainda incompletos</span>}
            {intel.writing.repeatedMainError ? <span>erro principal reincidente × {intel.writing.repeatedMainError.count}</span> : <span>sem reincidência comprovada</span>}
          </div>
        </> : <EmptyState title="Ainda sem redação executada." description="O módulo entra na decisão quando houver prazo vencido, reescrita ou evidência de reincidência."/>}
      </article>
      <article className="performance-panel">
        <SectionHeader eyebrow="CHECKPOINTS" title="Resultado que recalibra a sequência" />
        {intel.checkpoint.latest ? <>
          <strong>{intel.checkpoint.latest.title || intel.checkpoint.latest.dxx}</strong>
          <p>{intel.checkpoint.latest.p1Open == null ? "P1 —" : intel.checkpoint.latest.p1Open + " P1 aberto(s)"} · {intel.checkpoint.latest.recurrent == null ? "reincidências —" : intel.checkpoint.latest.recurrent + " reincidência(s)"} · {intel.checkpoint.trend.label}{intel.checkpoint.trend.delta==null?"":" · "+(intel.checkpoint.trend.delta>0?"+":"")+intel.checkpoint.trend.delta.toFixed(1)+" p.p."}.</p>
          <div className="mentor-evidence-v5">
            <span>{intel.checkpoint.generalAccuracy == null ? "gerais sem precisão calculável" : intel.checkpoint.generalAccuracy.toFixed(1) + "% gerais"}</span>
            <span>{intel.checkpoint.specificAccuracy == null ? "específicos sem precisão calculável" : intel.checkpoint.specificAccuracy.toFixed(1) + "% específicos"}</span>
            <span>{intel.checkpoint.weightedAccuracy == null ? "ponderada indisponível" : intel.checkpoint.weightedAccuracy.toFixed(1) + "% precisão ponderada"}</span>
          </div>
        </> : <EmptyState title="Ainda sem checkpoint executado." description="Quando houver resultado real, P1 e reincidência passam a recalibrar a próxima ação."/>}
      </article>
    </section>

    <section className="performance-panel">
      <SectionHeader eyebrow="INCERTEZA" title="Onde ainda não sabemos" detail="Desconhecido não é convertido em zero nem em fraqueza."/>
      {intel.uncertainties.length?<div className="uncertainty-grid-v5">{intel.uncertainties.map((u:any)=><article key={u.title}><strong>{u.title}</strong><p>{u.detail}</p></article>)}</div>:<EmptyState title="Nenhuma incerteza relevante identificada no recorte atual."/>}
    </section>

    <details className="methodology-card-v5"><summary>Metodologia completa do Mentor</summary>
      <p><b>Prioridade:</b> {intel.methodology.priority}</p><p><b>Confiança:</b> {intel.methodology.confidence}</p>
      <p><b>Força:</b> {intel.methodology.strength}</p><p><b>Decisão:</b> {intel.methodology.decision}</p><p><b>Edital:</b> {intel.methodology.edital}</p><p><b>Agenda:</b> {intel.methodology.agenda}</p>
    </details>
  </section>;
}
