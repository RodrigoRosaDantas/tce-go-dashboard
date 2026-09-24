import { useMemo, useState } from "react";
import type { Snapshot } from "../types";
import { conflictCount, pendingCount, platformAccountUrl } from "../progress";
import { useOperational } from "./OperationalContext";
import { DataNotice, EmptyState, MetricCard, PageHeader, SectionHeader, StatusPill } from "./ui";
import { accuracy, buildDataIssues, dataOrigin, disciplineRows, errorRows, hasExecution, pct, plannedTimeRange, reviewStats, sessionRowsByDay, subjectForDay } from "./analytics";
import { href } from "../v3/shared";
import { buildStudyIntelligence } from "./intelligence-core.mjs";

type Tab = "overview" | "execution" | "subjects" | "edital" | "errors" | "reviews" | "writing" | "checkpoints" | "quality";
type StatusFilter = "all" | "executed" | "pending" | "completed";

function formatMinutes(value: number | null) {
  if (value == null) return "—";
  const h = Math.floor(value / 60);
  const m = Math.round(value % 60);
  return h ? h + "h " + String(m).padStart(2, "0") + "m" : m + " min";
}

function AnalyticsBar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return <div className="analytics-bar-v41"><span style={{ width: String(width) + "%" }} /></div>;
}

export function DataDashboardPage({ snapshot }: { snapshot: Snapshot }) {
  const { summary, connected, loading, refresh } = useOperational();
  const [tab, setTab] = useState<Tab>("overview");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [disciplineFilter, setDisciplineFilter] = useState("all");

  const dayMap = useMemo(() => new Map(summary.dayControl.map((day) => [day.dxx, day])), [summary.dayControl]);
  const sessionMap = useMemo(() => sessionRowsByDay(summary), [summary]);
  const issues = useMemo(() => buildDataIssues(summary, snapshot), [summary, snapshot]);
  const disciplines = useMemo(() => disciplineRows(summary, snapshot), [summary, snapshot]);
  const errorsByTopic = useMemo(() => errorRows(summary.errors), [summary.errors]);
  const retention = useMemo(() => reviewStats(summary.reviews), [summary.reviews]);
  const intel = useMemo(() => buildStudyIntelligence({ snapshot, summary }), [snapshot, summary]);

  const activeDays = snapshot.days.filter((day) => !day.protected);
  const questionMetaMap = useMemo(() => new Map(summary.questionMeta.map((item) => [String(item.dxx || "").toUpperCase(), item])), [summary.questionMeta]);
  const executionDays = summary.dayControl.filter((day) => !day.protected && hasExecution(day));
  const completed = executionDays.filter((day) => day.completed).length;
  const plannedQuestions = activeDays.reduce((sum, day) => {
    const canonicalMeta = dayMap.get(day.dxx)?.metaQuestions ?? questionMetaMap.get(day.dxx)?.meta;
    const publicFallback = day.questionSlug ? snapshot.questions[day.questionSlug]?.meta ?? snapshot.questions[day.questionSlug]?.valid ?? 0 : 0;
    return sum + (canonicalMeta ?? publicFallback);
  }, 0);
  const knownAggregate = (key: "questionsDone" | "correct" | "errors" | "doubts" | "timeMinutes") =>
    executionDays.length > 0 && executionDays.every((day) => day[key] != null)
      ? executionDays.reduce((sum, day) => sum + Number(day[key]), 0)
      : null;
  const questions = knownAggregate("questionsDone");
  const correct = knownAggregate("correct");
  const errors = knownAggregate("errors");
  const doubts = knownAggregate("doubts");
  const minutes = knownAggregate("timeMinutes");
  const precision = accuracy(correct, errors);
  const coverage = plannedQuestions && questions != null ? (questions / plannedQuestions) * 100 : null;
  const timePlan = plannedTimeRange(summary.dayControl);
  const openErrors = summary.errors.filter((item) => !["Validado", "Encerrado"].includes(item.status));
  const criticalErrors = openErrors.filter((item) => item.fatal || item.severity === "P1");
  const incompleteDxx = new Set(issues.filter((issue) => issue.source === "Dxx" && issue.level !== "info").map((issue) => issue.key));

  const latestEdit = [...summary.dayControl.map((x) => x.lastEditedAt), ...summary.sessions.map((x) => x.lastEditedAt), ...summary.questionMeta.map((x) => x.lastEditedAt), ...summary.reviews.map((x) => x.lastEditedAt), ...summary.errors.map((x) => x.lastEditedAt), ...summary.redactions.map((x) => x.lastEditedAt), ...summary.simulations.map((x) => x.lastEditedAt)]
    .filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;

  const originCounts = executionDays.reduce<Record<string, number>>((acc, day) => {
    const label = dataOrigin(day, sessionMap.get(day.dxx) ?? []);
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});

  const typeOptions = [...new Set(activeDays.map((day) => day.type).filter(Boolean))].sort();
  const disciplineOptions = disciplines.map((row) => row.discipline);
  const filteredDays = activeDays.filter((day) => {
    const raw = dayMap.get(day.dxx);
    const executed = raw ? hasExecution(raw) : false;
    if (statusFilter === "executed" && !executed) return false;
    if (statusFilter === "pending" && executed) return false;
    if (statusFilter === "completed" && !raw?.completed) return false;
    if (typeFilter !== "all" && day.type !== typeFilter) return false;
    if (disciplineFilter !== "all") {
      const discipline = subjectForDay(summary, day.dxx);
      if (discipline !== disciplineFilter) return false;
    }
    return true;
  });

  const tabs: Array<[Tab, string]> = [["overview","Visão geral"],["execution","Execução"],["subjects","Matérias"],["edital","Edital"],["errors","Erros"],["reviews","Retenção"],["writing","Redação"],["checkpoints","Checkpoints"],["quality","Dados"]];

  return <section className="data-dashboard-v41">
    <PageHeader eyebrow="DATA & ANALYTICS · NOTION CANÔNICO" title="Dashboard de preparação" description="O Notion é a fonte da verdade. Se você estudar direto nele, o Dashboard deve refletir os mesmos registros sem depender do site." aside={<DataNotice canonical={summary.canonical} degraded={summary.degraded} generatedAt={summary.generatedAt} />} />

    <div className="dashboard-source-banner-v41">
      <div><span className={summary.canonical ? "live-dot" : "warn-dot"} /><div><strong>{summary.canonical ? "Notion lido diretamente" : "Modo degradado / cache"}</strong><small>{latestEdit ? "Última edição observada: " + new Date(latestEdit).toLocaleString("pt-BR") : "Nenhuma edição operacional observada"}</small></div></div>
      <p><b>Regra:</b> timer, bookmark e nota local não viram desempenho. Indicadores usam os bancos operacionais do Notion.</p>
      {connected
        ? <button type="button" className="button secondary small" disabled={loading} onClick={() => void refresh()}>{loading ? "Atualizando…" : "Reler Notion"}</button>
        : <a className="button secondary small" href={platformAccountUrl()}>Conectar dados privados →</a>}
    </div>

    <nav className="analytics-tabs-v41" aria-label="Seções do Dashboard">{tabs.map(([value, label]) => <button type="button" key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>

    {tab === "overview" ? <>
      <div className="analytics-kpis-v41">
        <MetricCard label="SESSÕES CONCLUÍDAS" value={completed} detail={executionDays.length + " com execução · " + activeDays.length + " previstas"} tone="accent" />
        <MetricCard label="TEMPO EFETIVO" value={formatMinutes(minutes)} detail={timePlan.max != null ? "planejado até " + formatMinutes(timePlan.max) : "planejamento não consolidado"} />
        <MetricCard label="QUESTÕES" value={questions ?? "—"} detail={questions == null ? "execução ausente ou campos incompletos" : plannedQuestions + " previstas · " + pct(coverage, 1) + " executadas"} />
        <MetricCard label="PRECISÃO" value={pct(precision, 1)} detail={correct == null || errors == null || doubts == null ? "dados de execução incompletos" : correct + " acertos · " + errors + " erros · " + doubts + " dúvidas"} tone={precision != null && precision < 70 ? "warning" : "default"} />
        <MetricCard label="REVISÕES PENDENTES" value={retention.pending} detail={retention.completed + " concluídas · " + retention.questions + " questões de revisão"} />
        <MetricCard label="ERROS ABERTOS" value={openErrors.length} detail={criticalErrors.length + " P1/Fatal"} tone={criticalErrors.length ? "danger" : "default"} />
        <MetricCard label="QUALIDADE DOS DADOS" value={issues.filter((x) => x.level !== "info").length} detail={incompleteDxx.size + " Dxx incompletos"} tone={issues.some((x) => x.level === "error") ? "danger" : issues.some((x) => x.level === "warning") ? "warning" : "default"} />
        <MetricCard label="SYNC" value={conflictCount() ? conflictCount() + " conflito(s)" : pendingCount() ? pendingCount() + " pendente(s)" : "Em dia"} detail={summary.canonical ? "dados do Notion" : "último cache"} />
      </div>

      <section className="analytics-panel-v41 intelligence-summary-v5">
        <SectionHeader eyebrow="INTELIGÊNCIA COMPARTILHADA" title="Diagnóstico que também alimenta Home, Mentor, Riscos e Reta Final" detail="A mesma evidência é interpretada uma vez e apresentada em contextos diferentes." action={<a href={href("/mentor/")}>Abrir Mentor →</a>} />
        <div className="diagnosis-grid-v4">
          <article><span className="eyebrow">FRAGILIDADES</span><strong>{intel.weaknesses.length}</strong><p>{intel.weaknesses[0] ? intel.weaknesses[0].subject + " · " + intel.weaknesses[0].topic + " · " + intel.weaknesses[0].score + "/100" : "Nenhuma fragilidade comprovada ainda."}</p></article>
          <article><span className="eyebrow">FORÇAS</span><strong>{intel.strengths.length}</strong><p>{intel.strengths[0] ? intel.strengths[0].subject + " · " + intel.strengths[0].level : "Amostra ainda insuficiente para reconhecer força."}</p></article>
          <article><span className="eyebrow">INCERTEZA</span><strong>{intel.uncertainties.length}</strong><p>{intel.uncertainties[0]?.detail || "Sem incerteza relevante no recorte atual."}</p></article>
          <article><span className="eyebrow">RISCO</span><strong>{intel.risks.length}</strong><p>{intel.risks[0]?.title || "Nenhum risco com evidência suficiente."}</p></article>
        </div>
      </section>

      <div className="analytics-grid-v41 two">
        <section className="analytics-panel-v41">
          <SectionHeader eyebrow="PLANEJAMENTO × EXECUÇÃO" title="Carga de questões" detail="Planejado = Meta de questões do Dxx; realizado = Questões feitas. Ambos vêm do Notion." />
          <div className="big-comparison-v41"><div><span>Planejado</span><strong>{plannedQuestions}</strong></div><b>→</b><div><span>Executado</span><strong>{questions ?? "—"}</strong></div><em>{pct(coverage, 1)}</em></div>
          {questions == null ? <p className="muted">Ausência de métricas completas não é convertida em zero executado.</p> : <AnalyticsBar value={questions} max={plannedQuestions} />}
          <div className="comparison-foot-v41"><span>Sessões concluídas</span><strong>{completed}/{activeDays.length}</strong></div>
        </section>
        <section className="analytics-panel-v41">
          <SectionHeader eyebrow="ORIGEM" title="Como a execução chegou ao Notion" detail="Dxx é o total canônico; Sessões acrescenta rastreabilidade." />
          <div className="source-breakdown-v41">{Object.keys(originCounts).length ? Object.entries(originCounts).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong><AnalyticsBar value={value} max={Math.max(1, executionDays.length)} /></div>) : <p>Nenhuma execução real registrada ainda.</p>}</div>
        </section>
      </div>

      <section className="analytics-panel-v41">
        <SectionHeader eyebrow="S01–S47" title="Previsto × realizado por sessão" detail="Campo vazio permanece vazio; ausência não é tratada como zero de desempenho." action={<button type="button" onClick={() => setTab("execution")}>Abrir detalhes →</button>} />
        <div className="execution-strip-v41">{activeDays.map((day) => {
          const raw = dayMap.get(day.dxx);
          const done = raw?.questionsDone;
          const meta = raw?.metaQuestions ?? questionMetaMap.get(day.dxx)?.meta ?? (day.questionSlug ? snapshot.questions[day.questionSlug]?.meta ?? snapshot.questions[day.questionSlug]?.valid : 0) ?? 0;
          const height = meta ? Math.max(4, Math.min(100, ((done ?? 0) / meta) * 100)) : 4;
          return <button type="button" key={day.dxx} className={raw && hasExecution(raw) ? "executed" : ""} title={(day.session || "") + " · " + day.dxx + " · " + (done == null ? "não preenchido" : done) + "/" + meta} onClick={() => setTab("execution")}><span>{day.session}</span><i style={{ height: String(height) + "%" }} /><small>{done == null ? "—" : done}</small></button>;
        })}</div>
      </section>

      <div className="analytics-grid-v41 two">
        <section className="analytics-panel-v41"><SectionHeader eyebrow="ERROS" title="Pontos de atenção" action={<button type="button" onClick={() => setTab("errors")}>Detalhar →</button>} />{errorsByTopic.length ? <div className="rank-list-v41">{errorsByTopic.slice(0, 6).map((row, index) => <div key={row.label}><b>{String(index + 1).padStart(2,"0")}</b><span><strong>{row.label}</strong><small>{row.open} aberto(s) · {row.recurrent} reincidência(s)</small></span>{row.critical ? <StatusPill tone="danger">{row.critical} crítico(s)</StatusPill> : <StatusPill>monitorar</StatusPill>}</div>)}</div> : <EmptyState title="Sem erros registrados." description="O ranking nascerá do Caderno de Erros do Notion." />}</section>
        <section className="analytics-panel-v41"><SectionHeader eyebrow="DADOS" title="Saúde do preenchimento" action={<button type="button" onClick={() => setTab("quality")}>Auditar →</button>} /><div className="quality-summary-v41"><div><strong>{executionDays.length - incompleteDxx.size}</strong><span>Dxx executados completos</span></div><div><strong>{incompleteDxx.size}</strong><span>Dxx incompletos</span></div><div><strong>{summary.sessions.length}</strong><span>Sessões detalhadas</span></div><div><strong>{issues.filter((x) => x.level === "error").length}</strong><span>inconsistências</span></div></div></section>
      </div>
    </> : null}

    {tab === "execution" ? <>
      <section className="analytics-filters-v41">
        <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="all">Todos</option><option value="executed">Com execução</option><option value="completed">Concluídos</option><option value="pending">Sem execução</option></select></label>
        <label>Tipo<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">Todos</option>{typeOptions.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Disciplina<select value={disciplineFilter} onChange={(event) => setDisciplineFilter(event.target.value)}><option value="all">Todas</option>{disciplineOptions.map((x) => <option key={x}>{x}</option>)}</select></label>
        <span>{filteredDays.length} Dxx</span>
      </section>
      <section className="analytics-panel-v41"><SectionHeader eyebrow="DXX CANÔNICO" title="Planejamento × execução" detail="Você pode preencher esses campos direto no Notion; o site apenas relê." /><div className="analytics-table-wrap-v41"><table className="analytics-table-v41"><thead><tr><th>Sessão</th><th>Tipo</th><th>Origem</th><th>Tempo</th><th>Questões</th><th>Acertos</th><th>Erros</th><th>Dúvidas</th><th>Precisão</th><th>Dados</th></tr></thead><tbody>{filteredDays.map((day) => {
        const raw = dayMap.get(day.dxx); const sessions = sessionMap.get(day.dxx) ?? []; const meta = raw?.metaQuestions ?? questionMetaMap.get(day.dxx)?.meta ?? (day.questionSlug ? snapshot.questions[day.questionSlug]?.meta ?? snapshot.questions[day.questionSlug]?.valid : null); const dayIssues = issues.filter((x) => x.source === "Dxx" && x.key === day.dxx && x.level !== "info");
        return <tr key={day.dxx} className={raw && hasExecution(raw) ? "has-execution" : ""}><td><a href={href("/dia/" + day.dxx.toLowerCase() + "/")}><strong>{day.session}</strong><small>{day.dxx}</small></a></td><td>{day.type}</td><td>{raw ? dataOrigin(raw, sessions) : "—"}</td><td><strong>{raw?.timeMinutes == null ? "—" : formatMinutes(raw.timeMinutes)}</strong><small>{raw?.plannedTime ? "prev. " + raw.plannedTime : ""}</small></td><td><strong>{raw?.questionsDone == null ? "—" : raw.questionsDone}</strong><small>{meta != null ? "meta " + meta : ""}</small></td><td>{raw?.correct ?? "—"}</td><td>{raw?.errors ?? "—"}</td><td>{raw?.doubts ?? "—"}</td><td>{pct(accuracy(raw?.correct, raw?.errors), 1)}</td><td>{dayIssues.length ? <StatusPill tone={dayIssues.some((x) => x.level === "error") ? "danger" : "warning"}>{dayIssues.length} alerta(s)</StatusPill> : raw && hasExecution(raw) ? <StatusPill tone="success">Completo</StatusPill> : <StatusPill>Não executado</StatusPill>}</td></tr>;
      })}</tbody></table></div></section>
    </> : null}

    {tab === "subjects" ? <section className="analytics-panel-v41"><SectionHeader eyebrow="MATÉRIAS" title="Carga e desempenho por disciplina" detail="O agrupamento vem de Matéria/foco no Banco de Questões do Notion; checkpoints, redações e correções não entram na estatística por matéria." />{disciplines.length ? <div className="subject-cards-v41">{disciplines.map((row) => <article key={row.discipline}><header><strong>{row.discipline}</strong><StatusPill>{row.execution}/{row.sessions} sessões</StatusPill></header><div className="subject-kpis-v41"><span><b>{row.planned}</b> previstas</span><span><b>{row.execution && row.metricsComplete ? row.done : "—"}</b> feitas</span><span><b>{row.execution && row.metricsComplete ? pct(accuracy(row.correct, row.errors), 1) : "—"}</b> precisão</span><span><b>{row.execution && row.metricsComplete ? formatMinutes(row.minutes) : "—"}</b> tempo</span></div>{row.execution && row.metricsComplete ? <AnalyticsBar value={row.done} max={row.planned} /> : <small className="muted">{row.execution ? "Métricas incompletas: não convertidas em zero." : "Sem execução real."}</small>}</article>)}</div> : <EmptyState title="Matérias indisponíveis neste cache." description="Conecte os dados privados ou releia o Notion para carregar Matéria/foco dos Qxx." />}</section> : null}

    {tab === "edital" ? <section className="analytics-panel-v41">
      <SectionHeader eyebrow="BLUEPRINT DO EDITAL" title="Distribuição planejada por disciplina" detail="Questões, pesos e pontos vêm do banco verticalizado. Execução por item não é inferida sem relação Dxx/Qxx." action={<a href={href("/edital/")}>Abrir edital →</a>} />
      <div className="model-gap-v41"><StatusPill tone="warning">Lacuna estrutural declarada</StatusPill><p>O banco de Edital Verticalizado ainda não possui relação direta com Dxx/Qxx. Por isso o Dashboard não fabrica percentual de cobertura executada por item. A execução por matéria usa Matéria/foco do Banco de Questões.</p></div>
      <div className="analytics-kpis-v41 compact">
        <MetricCard label="ITENS ATIVOS" value={(snapshot.edital ?? []).filter((item) => item.active).length} />
        <MetricCard label="QUESTÕES PREVISTAS" value={(snapshot.edital ?? []).filter((item) => item.active).reduce((sum,item)=>sum+item.questions,0)} />
        <MetricCard label="PONTOS PONDERADOS" value={(snapshot.edital ?? []).filter((item) => item.active).reduce((sum,item)=>sum+item.weightedPoints,0)} />
        <MetricCard label="ITENS COM FONTE" value={(snapshot.edital ?? []).filter((item) => item.active && item.normativeSource).length} />
      </div>
      <div className="analytics-table-wrap-v41"><table className="analytics-table-v41"><thead><tr><th>Código</th><th>Disciplina</th><th>Bloco</th><th>Questões</th><th>Peso</th><th>Pontos</th><th>Fonte normativa</th></tr></thead><tbody>
        {(snapshot.edital ?? []).filter((item)=>item.active).sort((a,b)=>a.order-b.order).map((item)=><tr key={item.code}><td><strong>{item.code}</strong></td><td>{item.discipline}</td><td>{item.block}</td><td>{item.questions}</td><td>{item.weight}</td><td>{item.weightedPoints}</td><td>{item.normativeSource || "—"}</td></tr>)}
      </tbody></table></div>
    </section> : null}

    {tab === "errors" ? <section className="analytics-panel-v41"><SectionHeader eyebrow="CLÍNICA DE ERROS" title="Matéria × tópico" action={<a href={href("/erros/")}>Abrir Caderno →</a>} />{errorsByTopic.length ? <div className="analytics-table-wrap-v41"><table className="analytics-table-v41"><thead><tr><th>Matéria</th><th>Tópico</th><th>Abertos</th><th>P1/Fatal</th><th>Reincidências</th><th>Dúvidas</th></tr></thead><tbody>{errorsByTopic.map((row) => <tr key={row.label}><td><strong>{row.subject}</strong></td><td>{row.topic}</td><td>{row.open}</td><td>{row.critical}</td><td>{row.recurrent}</td><td>{row.doubts}</td></tr>)}</tbody></table></div> : <EmptyState title="Sem dados de erro." description="Preencha o Caderno de Erros no Notion ou registre pelo site." />}</section> : null}

    {tab === "reviews" ? <section className="analytics-panel-v41"><SectionHeader eyebrow="D0 · D7 · D20" title="Retenção" action={<a href={href("/revisoes/")}>Abrir Revisões →</a>} /><div className="analytics-kpis-v41 compact"><MetricCard label="PROGRAMADAS" value={retention.total}/><MetricCard label="CONCLUÍDAS" value={retention.completed}/><MetricCard label="PENDENTES" value={retention.pending}/><MetricCard label="PRECISÃO" value={retention.completed && retention.metricsComplete ? pct(accuracy(retention.correct, retention.errors), 1) : "—"} detail={!retention.completed ? "nenhuma revisão concluída" : retention.metricsComplete ? retention.questions + " questões" : "dados de revisão incompletos"}/></div>{summary.reviews.length ? <div className="analytics-table-wrap-v41"><table className="analytics-table-v41"><thead><tr><th>Tipo</th><th>Dxx</th><th>Status</th><th>Prevista</th><th>Realizada</th><th>Questões</th><th>Precisão</th></tr></thead><tbody>{summary.reviews.map((row) => <tr key={row.id}><td><strong>{row.type}</strong><small>{row.reason || ""}</small></td><td>{row.dxx}</td><td>{row.status}</td><td>{row.plannedDate?.slice(0,10) || "—"}</td><td>{row.performedDate?.slice(0,10) || "—"}</td><td>{row.questions ?? "—"}</td><td>{pct(accuracy(row.correct, row.errors), 1)}</td></tr>)}</tbody></table></div> : <EmptyState title="Nenhuma revisão registrada." description="Os dados aparecerão quando o banco de Revisões for preenchido." />}</section> : null}

    {tab === "writing" ? <section className="analytics-panel-v41"><SectionHeader eyebrow="REDAÇÃO FCC" title="Evolução por critério" action={<a href={href("/redacoes/")}>Abrir Redações →</a>} />{summary.redactions.some((row) => row.score != null) ? <div className="writing-grid-v41">{summary.redactions.filter((row) => row.score != null).map((row) => <article key={row.id}><header><div><strong>{row.title}</strong><small>{row.dxx} · {row.status}</small></div><b>{row.score}/100</b></header><div className="writing-criteria-v41"><span>Recorte <b>{row.thematicCut ?? "—"}/20</b></span><span>Interpretação <b>{row.criticalInterpretation ?? "—"}/20</b></span><span>Progressão <b>{row.progression ?? "—"}/30</b></span><span>Coesão <b>{row.cohesion ?? "—"}/16</b></span><span>Morfossintaxe <b>{row.morphosyntax ?? "—"}/6</b></span><span>Vocabulário <b>{row.vocabulary ?? "—"}/8</b></span></div>{row.mainError ? <p><b>Erro principal:</b> {row.mainError}</p> : null}</article>)}</div> : <EmptyState title="Sem redação corrigida com nota." description="Preencha os critérios no Notion e o Dashboard passa a acompanhar a evolução." />}</section> : null}

    {tab === "checkpoints" ? <section className="analytics-panel-v41"><SectionHeader eyebrow="CHECKPOINTS / SIMULADOS" title="Marcos de decisão" action={<a href={href("/simulados/")}>Abrir registros →</a>} />{summary.simulations.some((row) => row.ipi != null || (row.generalTotal ?? 0) + (row.specificTotal ?? 0) > 0) ? <div className="checkpoint-grid-v41">{summary.simulations.map((row) => <article key={row.id}><header><div><strong>{row.title}</strong><small>{row.dxx} · {row.type || "Marco"}</small></div>{row.decision ? <StatusPill tone="accent">{row.decision}</StatusPill> : null}</header><div className="checkpoint-kpis-v41"><span>IPI <b>{row.ipi ?? "—"}</b></span><span>Gerais <b>{row.generalCorrect ?? "—"}/{row.generalTotal ?? "—"}</b></span><span>Específicos <b>{row.specificCorrect ?? "—"}/{row.specificTotal ?? "—"}</b></span><span>Tempo <b>{formatMinutes(row.timeMinutes)}</b></span><span>P1 <b>{row.p1Open ?? "—"}</b></span><span>Reincid. <b>{row.recurrent ?? "—"}</b></span></div><div className="checkpoint-domains-v41"><span>Controle Externo <b>{pct(row.controlExternalPct, 1)}</b></span><span>CASP <b>{pct(row.caspPct, 1)}</b></span><span>Legislação <b>{pct(row.legislationPct, 1)}</b></span><span>Conhecidas <b>{pct(row.knownSubjectsPct, 1)}</b></span></div></article>)}</div> : <EmptyState title="Nenhum checkpoint executado." description="Os campos preenchidos no Notion aparecerão aqui." />}</section> : null}

    {tab === "quality" ? <>
      <div className="analytics-kpis-v41 compact"><MetricCard label="INCONSISTÊNCIAS" value={issues.filter((x) => x.level === "error").length} tone={issues.some((x) => x.level === "error") ? "danger" : "default"}/><MetricCard label="CAMPOS INCOMPLETOS" value={issues.filter((x) => x.level === "warning").length} tone={issues.some((x) => x.level === "warning") ? "warning" : "default"}/><MetricCard label="AVISOS" value={issues.filter((x) => x.level === "info").length}/><MetricCard label="SESSÕES DETALHADAS" value={summary.sessions.length}/></div>
      <section className="analytics-panel-v41"><SectionHeader eyebrow="QUALIDADE DOS DADOS" title="O que precisa ser preenchido no Notion" detail="Campo ausente não é convertido em zero." />{issues.length ? <div className="data-issues-v41">{issues.map((issue, index) => <article key={issue.source + "-" + issue.key + "-" + index} className={"level-" + issue.level}><StatusPill tone={issue.level === "error" ? "danger" : issue.level === "warning" ? "warning" : "neutral"}>{issue.source}</StatusPill><div><strong>{issue.key}</strong><p>{issue.message}</p>{issue.fields?.length ? <small>Campos: {issue.fields.join(" · ")}</small> : null}</div></article>)}</div> : <EmptyState title="Nenhuma inconsistência detectada." description="Os registros operacionais disponíveis estão coerentes." />}</section>
      <section className="analytics-panel-v41"><SectionHeader eyebrow="FONTES LIDAS" title="Cobertura do resumo canônico" /><div className="quality-summary-v41 wide"><div><strong>{summary.dayControl.length}</strong><span>Dxx</span></div><div><strong>{summary.questionMeta.length}</strong><span>Qxx mapeados</span></div><div><strong>{summary.sessions.length}</strong><span>Sessões</span></div><div><strong>{summary.reviews.length}</strong><span>Revisões</span></div><div><strong>{summary.errors.length}</strong><span>Erros</span></div><div><strong>{summary.redactions.length}</strong><span>Redações</span></div><div><strong>{summary.simulations.length}</strong><span>Checkpoints</span></div></div></section>
    </> : null}
  </section>;
}
