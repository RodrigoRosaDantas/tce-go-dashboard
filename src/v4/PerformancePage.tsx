import type { Snapshot } from "../types";
import { conflictCount, pendingCount } from "../progress";
import { useOperational } from "./OperationalContext";
import { criticalErrors, isOpenError } from "./operations";
import { DataNotice, EmptyState, MetricCard, PageHeader, SectionHeader, StatusPill } from "./ui";
import { formatDate, href } from "../v3/shared";

export function PerformancePageV4({ snapshot }: { snapshot: Snapshot }) {
  const { summary, connected } = useOperational();
  const rows = snapshot.days
    .filter((day) => !day.protected)
    .map((day) => ({ day, progress: summary.progress.find((state) => state.dxx === day.dxx) }))
    .filter((item) => item.progress)
    .sort((a,b) => a.day.order - b.day.order);

  const completed = rows.filter((item) => item.progress?.completed).length;
  const studied = rows.filter((item) => item.progress?.studied).length;
  const minutes = rows.reduce((sum,item) => sum + (item.progress?.timeMinutes ?? 0), 0);
  const questions = rows.reduce((sum,item) => sum + (item.progress?.questionsDone ?? 0), 0);
  const correct = rows.reduce((sum,item) => sum + (item.progress?.correct ?? 0), 0);
  const errors = rows.reduce((sum,item) => sum + (item.progress?.errors ?? 0), 0);
  const doubts = rows.reduce((sum,item) => sum + (item.progress?.doubts ?? 0), 0);
  const accuracy = correct + errors ? Math.round((correct/(correct+errors))*100) : null;
  const doubtRate = correct ? Math.round((doubts/correct)*100) : null;
  const critical = criticalErrors(summary);
  const openErrors = summary.errors.filter(isOpenError);

  const topicMap = new Map<string,{ label:string; count:number; critical:number; recurrence:number }>();
  for (const item of openErrors) {
    const label = [item.subject,item.topic].filter(Boolean).join(" · ") || item.error || "Sem tópico";
    const current = topicMap.get(label) || { label,count:0,critical:0,recurrence:0 };
    current.count += 1;
    current.critical += Number(item.fatal || item.severity === "P1");
    current.recurrence += item.recurrence || 0;
    topicMap.set(label,current);
  }
  const weakSignals = [...topicMap.values()].sort((a,b) => b.critical-a.critical || b.recurrence-a.recurrence || b.count-a.count).slice(0,8);
  const maxQuestions = Math.max(1,...rows.map((item) => item.progress?.questionsDone ?? 0));

  return (
    <section className="performance-page performance-v4">
      <PageHeader
        eyebrow="DIAGNÓSTICO EXPLICÁVEL"
        title="Desempenho"
        description="Só entram execução confirmada/cache conhecido e erros realmente registrados. O painel não transforma cobertura editorial em nota pessoal."
        aside={<DataNotice canonical={summary.canonical} degraded={summary.degraded} generatedAt={summary.generatedAt} />}
      />

      <div className="performance-kpis performance-kpis-v4">
        <MetricCard label="CONCLUÍDAS" value={completed} detail={`de ${snapshot.days.filter((day)=>!day.protected).length} sessões`} tone="accent" />
        <MetricCard label="TEMPO" value={<>{Math.floor(minutes/60)}h <i>{minutes%60}m</i></>} detail={studied ? `${Math.round(minutes/studied)} min/sessão estudada` : "sem sessão estudada"} />
        <MetricCard label="QUESTÕES" value={questions} detail={`${correct} acertos · ${errors} erros`} />
        <MetricCard label="APROVEITAMENTO" value={accuracy === null ? "—" : `${accuracy}%`} detail={doubtRate === null ? "sem dado de dúvida" : `${doubtRate}% dos acertos tiveram dúvida`} tone={accuracy !== null && accuracy < 70 ? "warning" : "default"} />
      </div>

      <section className="performance-panel diagnosis-panel-v4">
        <SectionHeader
          eyebrow="SINAIS"
          title="O que os dados dizem"
          detail="Conclusões descritivas, com base visível nos registros atuais."
        />
        <div className="diagnosis-grid-v4">
          <article>
            <span className="eyebrow">RETENÇÃO</span>
            <strong>{summary.reviews.filter((review)=>!["Concluída","Cancelada por domínio"].includes(review.status)).length} revisão(ões) abertas</strong>
            <p>{summary.reviews.filter((review)=>review.status === "Concluída").length} já concluída(s) no resumo operacional.</p>
          </article>
          <article>
            <span className="eyebrow">ERROS</span>
            <strong>{openErrors.length} aberto(s)</strong>
            <p>{critical.length} P1/Fatal · {openErrors.filter((item)=>item.recurrence>0).length} com reincidência registrada.</p>
          </article>
          <article>
            <span className="eyebrow">CONFIANÇA</span>
            <strong>{doubts} acerto(s) com dúvida</strong>
            <p>{doubtRate === null ? "Ainda sem base para taxa." : `${doubtRate}% dos acertos foram marcados com dúvida.`}</p>
          </article>
          <article>
            <span className="eyebrow">SINCRONIZAÇÃO</span>
            <strong>{connected ? "Conta conectada" : "Somente cache local"}</strong>
            <p>{pendingCount()} pendente(s) · {conflictCount()} conflito(s).</p>
          </article>
        </div>
      </section>

      {weakSignals.length ? (
        <section className="performance-panel">
          <SectionHeader eyebrow="TÓPICOS DE ERRO" title="Onde os erros estão se acumulando" detail="Ranking por criticidade, reincidência e quantidade; não é uma nota de domínio." />
          <div className="weak-signals-v4">
            {weakSignals.map((item,index) => (
              <article key={item.label}>
                <b>{String(index+1).padStart(2,"0")}</b>
                <div><strong>{item.label}</strong><small>{item.count} erro(s) aberto(s) · {item.recurrence} reincidência(s)</small></div>
                {item.critical ? <StatusPill tone="danger">{item.critical} crítico(s)</StatusPill> : <StatusPill>monitorar</StatusPill>}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {rows.length ? (
        <>
          <section className="performance-panel">
            <SectionHeader eyebrow="EVOLUÇÃO" title="Questões por sessão" detail="A barra é volume; a porcentagem à direita é acerto entre acertos+erros registrados." />
            <div className="session-bars">
              {rows.map(({day,progress}) => {
                const count=progress?.questionsDone ?? 0;
                const total=(progress?.correct ?? 0)+(progress?.errors ?? 0);
                const pct=total?Math.round(((progress?.correct ?? 0)/total)*100):null;
                return <div className="session-bar-row" key={day.dxx}>
                  <div className="bar-label"><strong>{day.session} · {day.dxx}</strong><span>{count} questões</span></div>
                  <div className="bar-track"><span style={{width:`${Math.max(2,Math.round((count/maxQuestions)*100))}%`}} /></div>
                  <div className="bar-value">{pct===null?"—":`${pct}%`}</div>
                </div>;
              })}
            </div>
          </section>

          <section className="performance-panel">
            <SectionHeader eyebrow="HISTÓRICO" title="Sessão por sessão" action={<a href={href("/dias/")}>Abrir trilha</a>} />
            <div className="history-table-wrap">
              <table className="history-table">
                <thead><tr><th>Sessão</th><th>Data</th><th>Status</th><th>Tempo</th><th>Questões</th><th>Acertos</th><th>Erros</th><th>Dúvidas</th></tr></thead>
                <tbody>{rows.map(({day,progress}) => <tr key={day.dxx}>
                  <td><a href={href(`/dia/${day.dxx.toLowerCase()}/`)}><strong>{day.session}</strong><small>{day.dxx}</small></a></td>
                  <td>{formatDate(day.date)}</td>
                  <td><StatusPill tone={progress?.completed ? "success" : "accent"}>{progress?.completed ? "Concluída" : "Em andamento"}</StatusPill></td>
                  <td>{progress?.timeMinutes ?? 0} min</td><td>{progress?.questionsDone ?? 0}</td><td>{progress?.correct ?? 0}</td><td>{progress?.errors ?? 0}</td><td>{progress?.doubts ?? 0}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>
        </>
      ) : <EmptyState icon="◔" title="Ainda não há execução registrada." description="O diagnóstico começa vazio e cresce apenas com dados reais." action={<a className="button primary" href={href("/")}>Ir para Hoje →</a>} />}
    </section>
  );
}
