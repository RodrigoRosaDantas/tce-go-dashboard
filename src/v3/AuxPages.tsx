import type { Snapshot } from "../types";
import { ErrorWriteback, EssayWriteback, ReviewWriteback, SimulationWriteback } from "../ExecutionForms";
import { activeDays, formatDate, hasPublicSession, href } from "./shared";

export function TrailPage({ snapshot }: { snapshot: Snapshot }) {
  const active = activeDays(snapshot);
  const protectedDays = [...snapshot.days].filter((day) => day.protected).sort((a, b) => a.order - b.order);

  return (
    <section className="trail-page-v3">
      <div className="page-heading split">
        <div><span className="eyebrow">S01–S47</span><h1>Trilha de estudo</h1><p>A ordem pedagógica dos 47 dias ativos é a navegação principal. D001–D100 continua preservado como calendário canônico.</p></div>
        <div className="trail-summary"><strong>{active.filter((day) => hasPublicSession(snapshot, day)).length}</strong><span>sessões publicadas</span><small>{protectedDays.length} dias protegidos</small></div>
      </div>

      <div className="trail-timeline">
        {active.map((day, index) => {
          const ready = hasPublicSession(snapshot, day);
          return (
            <article className={ready ? "trail-session ready" : "trail-session"} key={day.dxx}>
              <div className="timeline-marker"><span>{String(index + 1).padStart(2, "0")}</span><i /></div>
              <div className="trail-session-main">
                <div className="trail-session-meta"><strong>{day.session} · {day.dxx}</strong><span>{formatDate(day.date)}</span><span>{day.type}</span></div>
                <h2>{day.focus}</h2>
              </div>
              <div className="trail-session-actions">
                <span className={ready ? "status-chip success" : "status-chip"}>{ready ? "Disponível" : "Aguardando"}</span>
                {ready ? <a className="button secondary small" href={href(`/dia/${day.dxx.toLowerCase()}/`)}>Abrir →</a> : null}
              </div>
            </article>
          );
        })}
      </div>

      <details className="calendar-details">
        <summary>Calendário D001–D100 e dias protegidos</summary>
        <div className="calendar-grid">
          {[...snapshot.days].sort((a, b) => a.order - b.order).map((day) => (
            <div key={day.dxx} className={day.protected ? "protected" : "active"}>
              <strong>{day.dxx}</strong><span>{formatDate(day.date)}</span><small>{day.protected ? "Protegido" : day.session}</small>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

export function RevisionsPage({ snapshot }: { snapshot: Snapshot }) {
  return (
    <section className="aux-page">
      <div className="page-heading"><span className="eyebrow">RETENÇÃO</span><h1>Revisões</h1><p>D0, D7, D20 e Fatal Errors são tratados como gatilhos operacionais. Registrar revisão não altera conteúdo editorial.</p></div>
      <div className="module-intro-grid">
        <article><b>D0</b><h2>Fechamento imediato</h2><p>Recuperação ativa da sessão que acabou de ser estudada.</p></article>
        <article><b>D7</b><h2>Retenção curta</h2><p>Usar quando o conteúdo exige retorno programado ou quando o erro justificar.</p></article>
        <article><b>D20</b><h2>Retenção longa</h2><p>Consolidação seletiva; não é uma repetição automática de tudo.</p></article>
      </div>
      <ReviewWriteback snapshot={snapshot} />
    </section>
  );
}

export function ErrorsPage({ snapshot }: { snapshot: Snapshot }) {
  return (
    <section className="aux-page">
      <div className="page-heading"><span className="eyebrow">CLÍNICA DE ERROS</span><h1>Caderno de erros</h1><p>Registre somente o erro que merece reaparecer: causa, severidade, reincidência e ação de recuperação.</p></div>
      <div className="error-principles">
        <span><b>01</b> identificar a causa</span><span><b>02</b> reduzir ao fundamento decisivo</span><span><b>03</b> definir a próxima ação</span>
      </div>
      <ErrorWriteback snapshot={snapshot} />
    </section>
  );
}

export function RedactionsPage({ snapshot }: { snapshot: Snapshot }) {
  const rows = snapshot.redactions ?? [];
  return (
    <section className="aux-page">
      <div className="page-heading"><span className="eyebrow">R1–R8</span><h1>Redações</h1><p>Agenda editorial pública; texto produzido, tempo, correção e reescrita permanecem privados.</p></div>
      {rows.length ? <div className="card-grid">{rows.map((item) => (
        <article className="module-card" key={item.code}>
          <div className="module-card-top"><span>{item.code}</span><strong>{item.dxx}</strong></div>
          <h2>{item.title}</h2>
          <p>{item.theme || "Tema editorial sem descrição pública."}</p>
          <small>{item.date ? formatDate(item.date) : "Data não definida"}</small>
        </article>
      ))}</div> : <Empty label="Plano R1–R8 ainda não disponível no snapshot." />}
      <EssayWriteback snapshot={snapshot} />
    </section>
  );
}

export function SimulationsPage({ snapshot }: { snapshot: Snapshot }) {
  const rows = snapshot.simulations ?? [];
  return (
    <section className="aux-page">
      <div className="page-heading"><span className="eyebrow">CHECKPOINTS</span><h1>Simulados</h1><p>Marcos de aferição do projeto. Resultado pessoal só aparece depois de execução real.</p></div>
      {rows.length ? <div className="card-grid">{rows.map((item) => (
        <article className="module-card" key={item.dxx}>
          <div className="module-card-top"><span>{item.dxx}</span><strong>{item.type}</strong></div>
          <h2>{item.title}</h2>
          <p>{item.date ? formatDate(item.date) : "Data não definida"}</p>
          <small>{item.plannedCoverage || "—"} itens previstos · {item.plannedSessions || "—"} sessões cobertas</small>
        </article>
      ))}</div> : <Empty label="Plano de simulados ainda não disponível no snapshot." />}
      <SimulationWriteback snapshot={snapshot} />
    </section>
  );
}

export function EditalPage({ snapshot }: { snapshot: Snapshot }) {
  const rows = snapshot.edital ?? [];
  const totalQuestions = rows.reduce((sum, item) => sum + (item.questions || 0), 0);
  const totalWeighted = rows.reduce((sum, item) => sum + (item.weightedPoints || 0), 0);
  return (
    <section className="aux-page">
      <div className="page-heading split">
        <div><span className="eyebrow">MAPA DA PROVA</span><h1>Edital verticalizado</h1><p>Estrutura do Edital nº 01/2026 com as alterações da Retificação nº 02/2026. A verticalização está concluída, cruzada e auditada; a coluna abaixo mostra o status editorial publicado pelo Notion.</p></div>
        <div className="mini-stats"><div><strong>{rows.length}</strong><span>eixos</span></div><div><strong>{totalQuestions}</strong><span>questões</span></div><div><strong>{totalWeighted}</strong><span>pontos ponderados</span></div></div>
      </div>
      {rows.length ? (
        <div className="table-shell">
          <table className="data-table-v3">
            <thead><tr><th>Código</th><th>Disciplina</th><th>Bloco</th><th>Questões</th><th>Peso</th><th>Pontos</th><th>Status editorial (Notion)</th></tr></thead>
            <tbody>{rows.map((item) => <tr key={item.code}><td><strong>{item.code}</strong></td><td>{item.discipline}</td><td>{item.block}</td><td>{item.questions}</td><td>{item.weight}</td><td>{item.weightedPoints}</td><td><span className="status-chip">{item.editorialStatus}</span></td></tr>)}</tbody>
          </table>
        </div>
      ) : <Empty label="Edital verticalizado não disponível." />}
    </section>
  );
}

export function LegislationPage({ snapshot }: { snapshot: Snapshot }) {
  const rows = snapshot.legislation ?? [];
  return (
    <section className="aux-page">
      <div className="page-heading"><span className="eyebrow">FONTES OFICIAIS</span><h1>Legislação</h1><p>Somente fontes externas oficiais publicáveis. URLs internas do Notion não entram no snapshot público.</p></div>
      {rows.length ? <div className="source-grid">{rows.map((item) => (
        <article className="source-card" key={item.code}>
          <div className="source-code">{item.code}</div>
          <div><span className="eyebrow">{item.category}</span><h2>{item.title}</h2><p>{item.cutoff || "Corte/vigência não informado"}{item.dxx ? ` · ${item.dxx}` : ""}</p>{item.use ? <small>{item.use}</small> : null}</div>
          <a className="button secondary small" href={item.officialUrl} target="_blank" rel="noreferrer">Fonte oficial ↗</a>
        </article>
      ))}</div> : <Empty label="Fontes oficiais não disponíveis." />}
    </section>
  );
}

export function FinalSprintPage({ snapshot }: { snapshot: Snapshot }) {
  const rows = snapshot.finalSprint ?? [];
  return (
    <section className="aux-page">
      <div className="page-heading"><span className="eyebrow">PÓS-D100</span><h1>Reta final</h1><p>O calendário final não cria D101–D117. Ele é uma camada de execução orientada pelos dados acumulados até D100.</p></div>
      {rows.length ? <div className="sprint-list">{rows.map((item) => (
        <article key={item.code}><div className="sprint-code">{item.code}</div><div><strong>{item.title}</strong><span>{item.type}</span></div><time>{formatDate(item.date)}</time></article>
      ))}</div> : <Empty label="Calendário de reta final não disponível." />}
    </section>
  );
}

export function SyncPage({ snapshot }: { snapshot: Snapshot }) {
  return (
    <section className="aux-page">
      <div className="page-heading"><span className="eyebrow">GOVERNANÇA</span><h1>Sistema e sincronização</h1><p>Estado técnico visível sem competir com a execução diária.</p></div>
      <div className="sync-grid">
        <article><span>FONTE CANÔNICA</span><strong>Notion</strong><p>Conteúdo editorial e execução confirmada.</p></article>
        <article><span>SNAPSHOT</span><strong>{snapshot.contentMode === "full" ? "Completo" : "Bootstrap"}</strong><p>{new Date(snapshot.generatedAt).toLocaleString("pt-BR")}</p></article>
        <article><span>COBERTURA</span><strong>{snapshot.publicStats.materialPages ?? Object.keys(snapshot.materials).length}</strong><p>materiais · {snapshot.publicStats.questionPages ?? Object.keys(snapshot.questions).length} Qxx</p></article>
        <article><span>HASH</span><strong className="mono">{snapshot.contentHash?.slice(0, 10) || "—"}</strong><p>identidade do conteúdo sanitizado</p></article>
      </div>
      <div className="governance-card">
        <h2>Precedência</h2>
        <div className="precedence"><span><b>1</b> Notion</span><i>→</i><span><b>2</b> Snapshot GitHub</span><i>→</i><span><b>3</b> Site/PWA</span><i>→</i><span><b>4</b> Cache/Supabase</span></div>
        <p>Falha de writeback não transforma cache em fonte canônica. Conteúdo privado e tokens do Notion não são publicados no navegador.</p>
      </div>
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section className="missing-study">
      <div className="page-heading"><span className="eyebrow">404</span><h1>Conteúdo não encontrado</h1><p>A rota não existe ou ainda não está disponível no snapshot publicado.</p></div>
      <a className="button secondary" href={href("/")}>← Voltar para Hoje</a>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="empty-module"><span>—</span><p>{label}</p></div>;
}
